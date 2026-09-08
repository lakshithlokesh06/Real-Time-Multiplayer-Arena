import { before, after, beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents, RoomState, PublicRoom, Result, GameSnapshot } from "@arena/shared";
import { createOptionalRedis } from "../src/config/redis.js";
import { createRoomService, type LobbySnapshot, generateRoomCode } from "../src/services/rooms.js";
import { testDatabase, testServer, registration, cookieFrom } from "./helpers.js";
type Client = Socket<ServerToClientEvents,ClientToServerEvents>;
let database: Awaited<ReturnType<typeof testDatabase>>;
let redis: ReturnType<typeof createOptionalRedis>;
let rooms: ReturnType<typeof createRoomService>;
let server: Awaited<ReturnType<typeof testServer>>;
let key: string;
let clients: Client[] = [];
let users: {cookie:string;id:string;client:Client}[] = [];
function unwrap<T=RoomState>(result: Result<T>): T { if (!result.ok) throw new Error(result.error.message); return result.data; }
function code<T>(result: Result<T>) { assert.equal(result.ok,false); return result.ok ? "unexpected" : result.error.code; }
async function connect(cookie?:string) {
 const client: Client = io(server.url,{autoConnect:false,reconnection:false,transports:["websocket"],extraHeaders:{Origin:server.config.frontendUrl,...(cookie?{Cookie:cookie}:{})}});
 clients.push(client);
 await new Promise<void>((resolve,reject)=>{client.once("connect",resolve);client.once("connect_error",reject);client.connect();}); return client;
}
const create = (client=users[0]!.client, maxPlayers=4, visibility:"PUBLIC"|"PRIVATE"="PUBLIC") => client.timeout(3000).emitWithAck("room:create",{name:"Test arena",visibility,maxPlayers});
const current = async(client=users[0]!.client) => unwrap<RoomState|null>(await client.timeout(3000).emitWithAck("room:sync",{}));
const list = async(client=users[0]!.client):Promise<PublicRoom[]> => unwrap<PublicRoom[]>(await client.timeout(3000).emitWithAck("rooms:list",{}));
const state = async():Promise<LobbySnapshot> => JSON.parse((await redis.client!.get(key))!);
async function until(check:()=>Promise<boolean>, timeout=2000) { const end=Date.now()+timeout; while(Date.now()<end){if(await check())return;await sleep(15);} throw new Error("Condition timed out"); }
before(async()=>{
 const url=process.env.TEST_REDIS_URL;
 if(!url || new URL(url).pathname!=="/15") throw new Error("Set TEST_REDIS_URL to a dedicated Redis database /15; test keys are isolated.");
 redis=createOptionalRedis(url);await redis.connect();assert.ok(redis.client,"Test Redis must be reachable");database=await testDatabase();
});
after(async()=>{await database?.close();redis?.close();});
beforeEach(async()=>{
 await database.db.user.deleteMany();key=`arena:test:lobby:${randomUUID()}`;clients=[];users=[];
 rooms=createRoomService(()=>redis.client,{key,heartbeatMs:0,startDelayMs:100});server=await testServer(database.db,rooms,160);
 for(let i=0;i<3;i++){
  const r=await server.request("/api/auth/register","POST",{...registration,email:`p${i}@example.com`,username:`player_${i}`,displayName:`Player ${i}`});
  assert.equal(r.status,201);const player=(await r.json()).player;const cookie=cookieFrom(r);users.push({cookie,id:player.profile.id,client:await connect(cookie)});
 }
});
afterEach(async()=>{for(const client of clients)client.disconnect();await server?.close();await rooms?.close();});

test("authenticated creation makes an unready host and persists atomic Redis indexes",async()=>{
 const room=unwrap(await create());assert.match(room.code,/^[A-HJ-NP-Z2-9]{6}$/);assert.equal(room.players.length,1);assert.equal(room.hostPlayerProfileId,users[0]!.id);assert.equal(room.players[0]!.ready,false);assert.equal(room.players[0]!.isHost,true);
 const saved=await state();assert.equal(saved.codes[room.code],room.id);assert.equal(saved.playerRooms[users[0]!.id],room.id);assert.ok(await redis.client!.ttl(key)>0);
 assert.ok(server.io.sockets.sockets.get(users[0]!.client.id!)!.rooms.has(`lobby:room:${room.id}`));
});
test("unauthenticated clients cannot establish a room-command socket",async()=>{await assert.rejects(connect(),/Authentication required/);assert.equal(Object.keys((await state()).rooms).length,0);});
test("room creation validates names, visibility, capacity, and unknown fields",async()=>{
 // Invalid attempts count toward the create limiter; use distinct authenticated players.
 const invalid=[{name:" "},{maxPlayers:1},{visibility:"SECRET"},{maxPlayers:9},{maxPlayers:2.5},{name:"<script>"},{name:"a".repeat(49)},{playerProfileId:users[1]!.id}];
 for(let i=0;i<invalid.length;i++){
  const result=await users[Math.floor(i/3)]!.client.timeout(3000).emitWithAck("room:create",{name:"Valid room",visibility:"PUBLIC",maxPlayers:4,...invalid[i]} as never);
  assert.equal(code(result),"INVALID_INPUT");
 }
});
test("room codes are random-shaped and collision retries preserve both lookups",async()=>{
 assert.ok(Array.from({length:100},generateRoomCode).every(value => /^[A-HJ-NP-Z2-9]{6}$/.test(value)));
 const collisionKey=`arena:test:lobby:${randomUUID()}`;let attempt=0;
 const service=createRoomService(()=>redis.client,{key:collisionKey,heartbeatMs:0,codeGenerator:()=>++attempt<=2?"ABC234":"XYZ789"});
 try { const a=await service.create({playerProfileId:"one",username:"one",displayName:"One"},{name:"Room one",visibility:"PUBLIC",maxPlayers:2});const b=await service.create({playerProfileId:"two",username:"two",displayName:"Two"},{name:"Room two",visibility:"PRIVATE",maxPlayers:2});assert.notEqual(a.code,b.code);assert.equal(attempt,3); }finally{await service.close();}
});
test("public discovery includes safe open public rooms and excludes private rooms",async()=>{
 const a=unwrap(await create());const b=unwrap(await create(users[1]!.client,4,"PRIVATE"));const found=await list(users[2]!.client);assert.deepEqual(found.map(r=>r.id),[a.id]);assert.ok(!JSON.stringify(found).includes(b.code));assert.ok(!JSON.stringify(found).includes(b.id));
});
test("joining a public room updates both players live",async()=>{
 const room=unwrap(await create());const changed=new Promise<RoomState|null>(resolve=>users[0]!.client.once("room:state",resolve));
 const joined=unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));assert.equal(joined.players.length,2);assert.equal((await changed)!.players.length,2);
});
test("private rooms reject ID joins and accept normalized codes",async()=>{
 const room=unwrap(await create(users[0]!.client,4,"PRIVATE"));assert.equal(code(await users[1]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id})),"NOT_FOUND");
 assert.equal(unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join-code",{code:` ${room.code.toLowerCase()} `})).players.length,2);
});
test("invalid and missing room codes return structured errors",async()=>{
 assert.equal(code(await users[0]!.client.timeout(3000).emitWithAck("room:join-code",{code:"bad"})),"INVALID_INPUT");assert.equal(code(await users[0]!.client.timeout(3000).emitWithAck("room:join-code",{code:"ABC234"})),"NOT_FOUND");
});
test("a full room rejects extra players and leaves public discovery",async()=>{
 const room=unwrap(await create(users[0]!.client,2));unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));assert.equal(code(await users[2]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id})),"ROOM_FULL");assert.equal((await list(users[2]!.client)).length,0);
});
test("duplicate join is idempotent and does not reset readiness",async()=>{
 const room=unwrap(await create());const client=users[1]!.client;unwrap(await client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));unwrap(await client.timeout(3000).emitWithAck("room:set-ready",{ready:true}));const duplicate=unwrap(await client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));assert.equal(duplicate.players.length,2);assert.equal(duplicate.players[1]!.ready,true);
});
test("a player cannot create or join multiple rooms",async()=>{
 const a=unwrap(await create());const b=unwrap(await create(users[1]!.client));assert.equal(code(await create()),"ALREADY_IN_ROOM");assert.equal(code(await users[0]!.client.timeout(3000).emitWithAck("room:join",{roomId:b.id})),"ALREADY_IN_ROOM");assert.equal((await current())!.id,a.id);
});
test("leave is repeatable and removes Socket.IO membership",async()=>{
 const room=unwrap(await create());unwrap(await users[0]!.client.timeout(3000).emitWithAck("room:leave",{}));unwrap(await users[0]!.client.timeout(3000).emitWithAck("room:leave",{}));assert.equal(await current(),null);assert.ok(!server.io.sockets.sockets.get(users[0]!.client.id!)!.rooms.has(`lobby:room:${room.id}`));
});
test("host transfer selects the earliest joined remaining player",async()=>{
 const room=unwrap(await create());for(const user of users.slice(1))unwrap(await user.client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));unwrap(await users[0]!.client.timeout(3000).emitWithAck("room:leave",{}));const result=(await current(users[2]!.client))!;assert.equal(result.hostPlayerProfileId,users[1]!.id);assert.equal(result.players.filter(p=>p.isHost).length,1);
});
test("empty room cleanup removes room, code, and player lookup",async()=>{
 const room=unwrap(await create());unwrap(await users[0]!.client.timeout(3000).emitWithAck("room:leave",{}));const snapshot=await state();assert.equal(snapshot.rooms[room.id],undefined);assert.equal(snapshot.codes[room.code],undefined);assert.deepEqual(snapshot.playerRooms,{});
});
test("readiness synchronizes live and repeated values are safe",async()=>{
 const room=unwrap(await create());unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));const changed=new Promise<RoomState|null>(resolve=>users[0]!.client.once("room:state",resolve));unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:set-ready",{ready:true}));assert.equal((await changed)!.players[1]!.ready,true);const repeated=unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:set-ready",{ready:true}));assert.equal(repeated.players[0]!.ready,false);
});
test("payload identity cannot change another player's readiness",async()=>{
 unwrap(await create());assert.equal(code(await users[0]!.client.timeout(3000).emitWithAck("room:set-ready",{ready:true,playerProfileId:users[1]!.id} as never)),"INVALID_INPUT");assert.equal((await current())!.players[0]!.ready,false);
});
test("outsiders cannot set readiness or start a room",async()=>{unwrap(await create());assert.equal(code(await users[1]!.client.timeout(3000).emitWithAck("room:set-ready",{ready:true})),"NOT_MEMBER");assert.equal(code(await users[1]!.client.timeout(3000).emitWithAck("room:start",{})),"NOT_MEMBER");});
test("only the host can start",async()=>{const room=unwrap(await create());unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));assert.equal(code(await users[1]!.client.timeout(3000).emitWithAck("room:start",{})),"NOT_HOST");});
test("host cannot start alone",async()=>{unwrap(await create());unwrap(await users[0]!.client.timeout(3000).emitWithAck("room:set-ready",{ready:true}));assert.equal(code(await users[0]!.client.timeout(3000).emitWithAck("room:start",{})),"NOT_READY");});
test("every player including host must be ready",async()=>{const room=unwrap(await create());unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:set-ready",{ready:true}));assert.equal(code(await users[0]!.client.timeout(3000).emitWithAck("room:start",{})),"NOT_READY");});
test("successful start emits one readiness event and enters IN_GAME",async()=>{
 const room=unwrap(await create());unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));for(const user of users.slice(0,2))unwrap(await user.client.timeout(3000).emitWithAck("room:set-ready",{ready:true}));let starts=0;users[0]!.client.on("room:ready-to-start",()=>starts++);
 const results=await Promise.all([users[0]!.client.timeout(3000).emitWithAck("room:start",{}),users[0]!.client.timeout(3000).emitWithAck("room:start",{})]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(unwrap(results.find(r=>r.ok)!).status,"STARTING");assert.equal(code(results.find(r=>!r.ok)!),"NOT_WAITING");await until(async()=> (await state()).rooms[room.id]?.status==="IN_GAME");assert.equal(starts,1);assert.ok((await current())!.gameId);
});
test("transport disconnect marks unready then transfers host after grace",async()=>{
 const room=unwrap(await create());unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));users[0]!.client.io.engine!.close();await until(async()=> (await state()).rooms[room.id]?.players[0]?.connected===false);await until(async()=> (await state()).rooms[room.id]?.hostPlayerProfileId===users[1]!.id);
});
test("reconnect within grace restores current room without duplicate membership",async()=>{
 const room=unwrap(await create());users[0]!.client.io.engine!.close();const replacement=await connect(users[0]!.cookie);assert.equal((await current(replacement))!.id,room.id);await sleep(200);assert.equal((await current(replacement))!.players.length,1);
});
test("a second tab replaces the controller without removing room membership",async()=>{
 const room=unwrap(await create());const old=users[0]!.client;const replaced=new Promise<void>(resolve=>old.once("lobby:replaced",resolve));const replacement=await connect(users[0]!.cookie);await replaced;assert.equal(old.connected,false);assert.equal((await current(replacement))!.id,room.id);
});
test("simultaneous final-slot joins admit exactly one player",async()=>{
 const room=unwrap(await create(users[0]!.client,2));const result=await Promise.all(users.slice(1).map(user=>user.client.timeout(3000).emitWithAck("room:join",{roomId:room.id})));assert.equal(result.filter(r=>r.ok).length,1);assert.equal(code(result.find(r=>!r.ok)!),"ROOM_FULL");assert.equal((await current())!.players.length,2);
});
test("public room payloads never contain account or internal storage fields",async()=>{
 const room=unwrap(await create());const payload=JSON.stringify({room,list:await list()});for(const field of ["email","password","token","sessionId","launchEndsAt","arena:lobby","playerRooms"])assert.ok(!payload.includes(field));
});
test("room command limiter bounds repeated listing and creation",async()=>{
 let limited=false;for(let i=0;i<45;i++){const r=await users[0]!.client.timeout(3000).emitWithAck("rooms:list",{});if(!r.ok){assert.equal(r.error.code,"RATE_LIMITED");limited=true;break;}}assert.equal(limited,true);
 for(let i=0;i<3;i++){unwrap(await create(users[1]!.client));unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:leave",{}));}assert.equal(code(await create(users[1]!.client)),"RATE_LIMITED");
});
test("logout revokes a player's socket and removes room membership",async()=>{
 const room=unwrap(await create());await server.request("/api/auth/logout","POST",{},users[0]!.cookie);await until(async()=> !(await state()).rooms[room.id]);
});
test("leaving during STARTING cancels the launch transition safely",async()=>{
 const room=unwrap(await create());unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join",{roomId:room.id}));for(const user of users.slice(0,2))unwrap(await user.client.timeout(3000).emitWithAck("room:set-ready",{ready:true}));unwrap(await users[0]!.client.timeout(3000).emitWithAck("room:start",{}));unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:leave",{}));assert.equal((await current())!.status,"WAITING");assert.equal((await current())!.players[0]!.ready,false);
});
test("room operations fail safely when Redis is unavailable",async()=>{const service=createRoomService(()=>undefined,{heartbeatMs:0});try{await assert.rejects(service.list(),/temporarily unavailable/);}finally{await service.close();}});

test("crash TTL expires the entire snapshot without orphaned indexes",async()=>{
 const ttlKey=`arena:test:lobby:${randomUUID()}`;const service=createRoomService(()=>redis.client,{key:ttlKey,heartbeatMs:0,ttlSeconds:1});
 try {await service.create({playerProfileId:"ttl",username:"ttl",displayName:"TTL"},{name:"Expiry room",visibility:"PUBLIC",maxPlayers:2});await until(async()=>await redis.client!.get(ttlKey)===null,2000);assert.equal(await service.sync("ttl"),null);}finally{await service.close();}
});

async function launch() {
 const room = unwrap(await create());
 unwrap(await users[1]!.client.timeout(3000).emitWithAck("room:join", {roomId: room.id}));
 for (const user of users.slice(0,2)) unwrap(await user.client.timeout(3000).emitWithAck("room:set-ready", {ready: true}));
 unwrap(await users[0]!.client.timeout(3000).emitWithAck("room:start", {}));
 await until(async () => (await state()).rooms[room.id]?.status === "IN_GAME");
 return (await game())!;
}
async function game(client = users[0]!.client) { return unwrap<GameSnapshot | null>(await client.timeout(3000).emitWithAck("game:sync", {})); }
function movement(gameId: string, sequence = 1) { return {gameId, sequence, up: false, down: false, left: false, right: true}; }
test("game sync rejects forged fields and exposes only the authenticated membership", async () => {
 assert.equal(await game(), null);
 const snapshot = await launch();
 assert.equal(snapshot.players.length, 2); assert.equal(await game(users[2]!.client), null);
 assert.equal(code(await users[0]!.client.timeout(3000).emitWithAck("game:sync", {playerProfileId: users[1]!.id} as never)), "INVALID_INPUT");
 for (const field of ["email", "session", "token", "password", "arena:lobby"]) assert.ok(!JSON.stringify(snapshot).includes(field));
 assert.equal(code(await users[2]!.client.timeout(3000).emitWithAck("room:join", {roomId:snapshot.roomId})), "NOT_WAITING");
});
test("movement before launch and into another player's game is rejected", async () => {
 const early = new Promise<{code:string}>(resolve => users[2]!.client.once("game:error", resolve));
 users[2]!.client.emit("game:input", movement(randomUUID())); assert.equal((await early).code, "NOT_MEMBER");
 const snapshot = await launch();
 const outsider = new Promise<{code:string}>(resolve => users[1]!.client.once("game:error", resolve));
 users[1]!.client.emit("game:input", movement(randomUUID())); assert.equal((await outsider).code, "NOT_MEMBER");
 assert.equal((await game())!.players[0]!.x, snapshot.players[0]!.x);
});
test("socket input is authoritative, acknowledged, and malformed coordinates are rejected", async () => {
 const snapshot = await launch(), client = users[0]!.client;
 const bad = new Promise<{code:string}>(resolve => client.once("game:error", resolve));
 client.emit("game:input", {...movement(snapshot.gameId), x: 0} as never); assert.equal((await bad).code, "INVALID_INPUT");
 const moved = new Promise<GameSnapshot>(resolve => { const listener = (s:GameSnapshot) => { if (s.players[0]!.lastSequence === 1) {client.off("game:state", listener);resolve(s);} };client.on("game:state", listener); });
 client.emit("game:input", movement(snapshot.gameId)); const result = await moved;
 assert.equal(result.players[0]!.x - snapshot.players[0]!.x, 13);
 client.emit("game:input", movement(snapshot.gameId)); await sleep(110); assert.equal((await game())!.players[0]!.x, result.players[0]!.x);
});
test("game input flood is bounded and cannot buy extra simulation steps", async () => {
 const snapshot = await launch(), client = users[0]!.client;
 const limited = new Promise<{code:string}>(resolve => client.once("game:error", resolve));
 for(let i=1;i<=100;i++) client.emit("game:input",movement(snapshot.gameId,i));
 assert.equal((await limited).code, "RATE_LIMITED"); await sleep(110);
 assert.ok((await game())!.players[0]!.x - snapshot.players[0]!.x <= 26);
});
test("active-game transport loss freezes immediately and expires membership after grace", async () => {
 const snapshot = await launch(), other = users[1]!.client;
 users[0]!.client.emit("game:input", movement(snapshot.gameId)); users[0]!.client.io.engine!.close();
 await until(async () => (await state()).rooms[snapshot.roomId]?.players[0]?.connected === false);
 const frozen = (await game(other))!.players[0]!; assert.equal(frozen.connected,false);
 await until(async () => (await state()).rooms[snapshot.roomId]?.players.length === 1);
 const result = (await game(other))!;assert.equal(result.players.length,1);assert.equal(result.gameId,snapshot.gameId);
});
test("refresh reconnect retains match and authoritative position without respawning", async () => {
 const snapshot = await launch(), client = users[0]!.client;
 client.emit("game:input", movement(snapshot.gameId)); await sleep(60);
 const before = (await game())!; client.io.engine!.close();
 const replacement = await connect(users[0]!.cookie);const after = (await game(replacement))!;
 assert.equal(after.gameId,before.gameId);assert.equal(after.players[0]!.x,before.players[0]!.x);assert.equal(after.players[0]!.connected,true);
 replacement.emit("game:input", movement(snapshot.gameId,after.players[0]!.lastSequence+1));await sleep(60);
 assert.ok((await game(replacement))!.players[0]!.x > after.players[0]!.x);
});
test("new tab is the sole active gameplay controller", async () => {
 const snapshot = await launch(), old = users[0]!.client;
 const replaced = new Promise<void>(resolve => old.once("disconnect", () => resolve()));
 const replacement = await connect(users[0]!.cookie); await replaced; assert.equal(old.connected,false);
 // The old client can no longer deliver input after replacement.
 const before = (await game(replacement))!.players[0]!.x;
 old.emit("game:input",movement(snapshot.gameId,999));
 replacement.emit("game:input", movement(snapshot.gameId));await sleep(60);
 assert.equal((await game(replacement))!.players[0]!.x,before+13);
});
test("game leave transfers host, removes gameplay control and cleans the final game", async () => {
 const snapshot = await launch(); unwrap(await users[0]!.client.timeout(3000).emitWithAck("game:leave",{}));
 assert.equal(await game(),null); const remaining = (await game(users[1]!.client))!;assert.equal(remaining.players.length,1);
 assert.equal((await current(users[1]!.client))!.hostPlayerProfileId,users[1]!.id);
 const rejected = new Promise<{code:string}>(resolve => users[0]!.client.once("game:error",resolve));users[0]!.client.emit("game:input",movement(snapshot.gameId));assert.equal((await rejected).code,"NOT_MEMBER");
 unwrap(await users[1]!.client.timeout(3000).emitWithAck("game:leave",{}));assert.equal(await game(users[1]!.client),null);assert.equal((await state()).rooms[snapshot.roomId],undefined);
});
test("logout immediately ends gameplay control", async () => {
 const snapshot = await launch();await server.request("/api/auth/logout","POST",{},users[0]!.cookie);
 await until(async () => (await state()).rooms[snapshot.roomId]?.players.length === 1);assert.equal(users[0]!.client.connected,false);
});

test("an authenticated outsider cannot submit input to a real active game", async () => {
 const snapshot = await launch();const client = users[2]!.client;
 const rejected = new Promise<{code:string}>(resolve => client.once("game:error",resolve));
 client.emit("game:input",movement(snapshot.gameId));assert.equal((await rejected).code,"NOT_MEMBER");
});
test("absolute session expiry rejects input immediately without a per-input database query", async () => {
 const snapshot = await launch(),client = users[0]!.client;
 server.io.sockets.sockets.get(client.id!)!.data.sessionExpiresAt = Date.now()-1;
 const disconnected = new Promise<void>(resolve => client.once("disconnect",()=>resolve()));
 client.emit("game:input",movement(snapshot.gameId));await disconnected;
 await until(async () => (await state()).rooms[snapshot.roomId]?.players.length===1);
});
