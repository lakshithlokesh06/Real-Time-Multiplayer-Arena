import { test } from "node:test";
import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { parseEnv } from "../src/config/env.js";
import { createOptionalRedis } from "../src/config/redis.js";
import { testDatabase, testServer, registration, cookieFrom } from "./helpers.js";

test("environment rejects invalid ports and origins", () => {
 assert.throws(() => parseEnv({ PORT: "NaN" }));
 assert.throws(() => parseEnv({ FRONTEND_URL: "https://example.com/path" }));
 assert.throws(() => parseEnv({ NODE_ENV: "production" }));
 assert.throws(() => parseEnv({ REDIS_URL: "https://example.com" }));
});
test("optional Redis tolerates an unavailable service", async () => {
 const disabled = createOptionalRedis();
 await disabled.connect();
 assert.equal(disabled.status, "disabled");
 const unavailable = createOptionalRedis("redis://127.0.0.1:1");
 try { await unavailable.connect(); assert.equal(unavailable.status, "unavailable"); }
 finally { unavailable.close(); }
});
test("HTTP health, errors, and Socket.IO lifecycle", { timeout: 10000 }, async () => {
 const database = await testDatabase();
 const server = await testServer(database.db);
 const { io, url, config } = server;
 const registered = await server.request("/api/auth/register", "POST", registration);
 const cookie = cookieFrom(registered);
 const client = connect(url, { autoConnect: false, transports: ["websocket"], reconnection: false, extraHeaders: { Origin: config.frontendUrl, Cookie: cookie } });
 try {
  const health = await fetch(`${url}/api/health`);
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.service, "arena-game-server");
  assert.equal(body.dependencies.redis, "disabled");
  assert.ok(Number.isFinite(Date.parse(body.timestamp)));
  assert.equal((await fetch(`${url}/unknown`)).status, 404);
  const malformed = await fetch(`${url}/api/health`, { method: "POST", headers: { "Content-Type": "application/json", "Origin": config.frontendUrl, "X-Arena-Request": "1" }, body: "{" });
  assert.equal(malformed.status, 400);
  await new Promise<void>((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); client.connect(); });
  const pong = new Promise<{socketId: string; timestamp: string}>(resolve => client.once("system:pong", resolve));
  client.emit("system:ping");
  assert.equal((await pong).socketId, client.id);
  const disconnected = new Promise<void>(resolve => io.sockets.sockets.get(client.id!)!.once("disconnect", () => resolve()));
  client.disconnect();
  await disconnected;
  assert.equal(io.sockets.sockets.size, 0);
 } finally { client.disconnect(); await server.close(); await database.close(); }
});
