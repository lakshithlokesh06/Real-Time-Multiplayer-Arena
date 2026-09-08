import { before, after, beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { io as connect, type Socket } from "socket.io-client";
import argon2 from "argon2";
import { testDatabase, testServer, registration, cookieFrom } from "./helpers.js";
import { hashToken } from "../src/services/auth.js";
import { parseEnv } from "../src/config/env.js";
let database: Awaited<ReturnType<typeof testDatabase>>;
let server: Awaited<ReturnType<typeof testServer>>;
before(async () => { database = await testDatabase(); });
after(async () => { await database?.close(); });
beforeEach(async () => { await database.db.user.deleteMany(); server = await testServer(database.db); });
afterEach(async () => { await server?.close(); });
async function register() { return server.request("/api/auth/register", "POST", registration); }
function safe(body: unknown, token?: string) {
 const text = JSON.stringify(body);
 for (const field of ["passwordHash", "tokenHash", "password", "sessions", ...(token ? [token] : [])]) assert.ok(!text.includes(field), `Sensitive field returned: ${field === token ? "token" : field}`);
}
function socket(cookie?: string, origin = server.config.frontendUrl) {
 return connect(server.url, { autoConnect: false, reconnection: false, timeout: 2000, transports: ["websocket"], extraHeaders: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, auth: { userId: "untrusted-client-id" } });
}
async function connected(client: Socket) { await new Promise<void>((resolve,reject) => { client.once("connect",resolve); client.once("connect_error",reject); client.connect(); }); }
async function rejected(client: Socket) { try { await new Promise<void>((resolve,reject) => { client.once("connect",() => reject(new Error("Unexpected authenticated connection"))); client.once("connect_error",() => resolve()); client.connect(); }); } finally { client.disconnect(); } }

test("registration normalizes identity and stores only secure password/session hashes", async () => {
 const response = await server.request("/api/auth/register", "POST", { ...registration, email: " PLAYER@EXAMPLE.COM ", username: " Player_One " });
 assert.equal(response.status,201);
 const body = await response.json();
 assert.equal(body.player.email,registration.email); assert.equal(body.player.profile.username,registration.username);
 const cookie = cookieFrom(response); const token = cookie.split("=")[1]!;
 safe(body,token);
 assert.match(response.headers.get("set-cookie")!,/HttpOnly/); assert.match(response.headers.get("set-cookie")!,/SameSite=Lax/);
 assert.equal(response.headers.get("cache-control"),"no-store");
 const user = await database.db.user.findUniqueOrThrow({where:{email:registration.email}});
 assert.match(user.passwordHash,/^\$argon2id\$/); assert.ok(await argon2.verify(user.passwordHash,registration.password));
 const session = await database.db.session.findFirstOrThrow();
 assert.equal(session.tokenHash,hashToken(token)); assert.notEqual(session.tokenHash,token);
 assert.equal(await database.db.playerProfile.count(),1);
});
test("duplicate normalized email is rejected without partial data", async () => {
 await register(); const r = await server.request("/api/auth/register","POST",{...registration,email:"PLAYER@example.com",username:"another_player"});
 assert.equal(r.status,409); assert.equal(await database.db.user.count(),1); assert.equal(await database.db.session.count(),1);
});
test("duplicate normalized username is rejected transactionally", async () => {
 await register(); const r = await server.request("/api/auth/register","POST",{...registration,email:"other@example.com",username:"PLAYER_ONE"});
 assert.equal(r.status,409); assert.equal(await database.db.user.count(),1); assert.equal(await database.db.playerProfile.count(),1);
});
test("invalid registration fields and unknown fields are rejected", async () => {
 for (const patch of [{email:"bad"},{username:"bad-name!"},{password:"short"},{displayName:"   "},{displayName:"<script>"},{admin:true}]) {
  assert.equal((await server.request("/api/auth/register","POST",{...registration,...patch})).status,400);
 }
 assert.equal(await database.db.user.count(),0);
});
test("login normalizes email, rotates the presented session, and returns safe data", async () => {
 const oldCookie = cookieFrom(await register());
 const r = await server.request("/api/auth/login","POST",{email:" PLAYER@EXAMPLE.COM ",password:registration.password},oldCookie);
 assert.equal(r.status,200); const cookie = cookieFrom(r); assert.notEqual(cookie,oldCookie); safe(await r.json(),cookie.split("=")[1]);
 assert.equal((await server.request("/api/auth/me","GET",undefined,oldCookie)).status,401);
 assert.equal(await database.db.session.count(),1);
});
test("wrong password and unknown account have identical credential errors", async () => {
 await register();
 const wrong = await server.request("/api/auth/login","POST",{email:registration.email,password:"wrong password"});
 const missing = await server.request("/api/auth/login","POST",{email:"nobody@example.com",password:"wrong password"});
 assert.equal(wrong.status,401); assert.equal(missing.status,401); assert.deepEqual(await wrong.json(),await missing.json());
});
test("me resolves a persisted session and never exposes secrets", async () => {
 const cookie = cookieFrom(await register());
 const r = await server.request("/api/auth/me","GET",undefined,cookie);
 assert.equal(r.status,200); const body = await r.json(); assert.equal(body.player.profile.displayName,registration.displayName); safe(body,cookie.split("=")[1]);
 // A separate service instance uses the same database, proving sessions are not process-local.
 const other = await testServer(database.db);
 try { assert.equal((await other.request("/api/auth/me","GET",undefined,cookie)).status,200); } finally { await other.close(); }
});
test("logout revokes the session, clears its cookie, and is repeatable", async () => {
 const cookie = cookieFrom(await register());
 const r = await server.request("/api/auth/logout","POST",{},cookie);
 assert.equal(r.status,204); assert.match(r.headers.get("set-cookie")!,/Expires=Thu, 01 Jan 1970/);
 assert.equal((await server.request("/api/auth/me","GET",undefined,cookie)).status,401);
 assert.equal((await server.request("/api/auth/logout","POST",{},cookie)).status,204);
 assert.equal((await server.request("/api/auth/logout","POST",{})).status,204);
 assert.equal(await database.db.session.count(),0);
});
test("protected REST rejects missing, malformed, and unknown cookies", async () => {
 for (const cookie of [undefined,"arena_session=bad",`arena_session=${"a".repeat(43)}`]) {
  assert.equal((await server.request("/api/auth/me","GET",undefined,cookie)).status,401);
  assert.equal((await server.request("/api/profile","PATCH",{displayName:"Hacker"},cookie)).status,401);
 }
});
test("expired session is rejected by REST and Socket.IO and can be cleaned up", async () => {
 const cookie = cookieFrom(await register());
 await database.db.session.updateMany({data:{expiresAt:new Date(Date.now()-1000)}});
 assert.equal((await server.request("/api/auth/me","GET",undefined,cookie)).status,401);
 await rejected(socket(cookie));
 assert.equal((await server.auth.cleanupExpired()).count,1);
});
test("display-name update persists, is trimmed, and returns safe player data", async () => {
 const cookie = cookieFrom(await register());
 const r = await server.request("/api/profile","PATCH",{displayName:"  Arena Ace  "},cookie);
 assert.equal(r.status,200); const body = await r.json(); assert.equal(body.player.profile.displayName,"Arena Ace"); safe(body);
 assert.equal((await database.db.playerProfile.findFirstOrThrow()).displayName,"Arena Ace");
});
test("profile rejects unsafe fields, control characters, blanks, and overlong names", async () => {
 const cookie = cookieFrom(await register());
 for (const body of [{displayName:""},{displayName:"a".repeat(41)},{displayName:"bad\u0000name"},{displayName:"<script>"},{displayName:"Good",email:"hijack@example.com"},{username:"replacement"}]) {
  assert.equal((await server.request("/api/profile","PATCH",body,cookie)).status,400);
 }
 assert.equal((await database.db.playerProfile.findFirstOrThrow()).displayName,registration.displayName);
});
test("authenticated socket uses server identity and preserves ping/pong", async () => {
 const cookie = cookieFrom(await register()); const client = socket(cookie);
 try {
  await connected(client);
  const context = server.io.sockets.sockets.get(client.id!)!.data;
  assert.equal(context.username,registration.username); assert.notEqual(context.userId,"untrusted-client-id"); assert.ok(context.playerProfileId);
  const pong = new Promise<{socketId:string}>(resolve=>client.once("system:pong",resolve)); client.emit("system:ping"); assert.equal((await pong).socketId,client.id);
 } finally { client.disconnect(); }
});
test("unauthenticated and untrusted-origin sockets are rejected", async () => {
 await rejected(socket());
 const cookie = cookieFrom(await register());
 await rejected(socket(cookie,"https://attacker.example"));
 await rejected(socket("arena_session=invalid"));
});
test("logout disconnects an already authenticated socket", async () => {
 const cookie = cookieFrom(await register()); const client = socket(cookie);
 try {
  await connected(client); const disconnected = new Promise<void>(resolve=>client.once("disconnect",()=>resolve()));
  await server.request("/api/auth/logout","POST",{},cookie); await disconnected; assert.equal(server.io.sockets.sockets.size,0);
 } finally { client.disconnect(); }
});
test("an expired connected socket cannot continue pinging", async () => {
 const cookie = cookieFrom(await register()); const client = socket(cookie);
 try {
  await connected(client); await database.db.session.updateMany({data:{expiresAt:new Date(Date.now()-1000)}});
  const disconnected = new Promise<void>(resolve=>client.once("disconnect",()=>resolve())); client.emit("system:ping"); await disconnected;
 } finally { client.disconnect(); }
});
test("CSRF defense rejects untrusted/missing origins and absent custom header", async () => {
 for (const headers of [{Origin:"https://attacker.example"},{Origin:""},{"X-Arena-Request":""}] as Record<string,string>[]) {
  assert.equal((await server.request("/api/auth/register","POST",registration,undefined,headers)).status,403);
 }
 assert.equal(await database.db.user.count(),0);
});
test("JSON-only and body-size limits are enforced", async () => {
 assert.equal((await server.request("/api/auth/register","POST",registration,undefined,{"Content-Type":"text/plain"})).status,415);
 assert.equal((await server.request("/api/auth/register","POST",{data:"a".repeat(17000)})).status,413);
});
test("authentication requests are rate limited", async () => {
 for(let i=0;i<20;i++) assert.equal((await server.request("/api/auth/login","POST",{})).status,400);
 const response = await server.request("/api/auth/register","POST",registration);
 assert.equal(response.status,429); assert.ok(response.headers.get("retry-after"));
});
test("production cookie configuration cannot disable TLS", () => {
 assert.throws(()=>parseEnv({NODE_ENV:"production",FRONTEND_URL:"https://arena.example",COOKIE_SECURE:"false"}));
 assert.throws(()=>parseEnv({COOKIE_SAME_SITE:"none"}));
 const env = parseEnv({NODE_ENV:"production",FRONTEND_URL:"https://arena.example"});
 assert.equal(env.cookieSecure,true); assert.equal(env.sessionCookieName,"__Host-arena_session");
});
test("deleting an account cascades profiles and sessions", async () => {
 await register(); await database.db.user.deleteMany(); assert.equal(await database.db.playerProfile.count(),0); assert.equal(await database.db.session.count(),0);
});
