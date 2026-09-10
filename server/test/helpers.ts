import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { Pool } from "pg";
import { createDatabase, type Database } from "../src/config/database.js";
import { parseEnv } from "../src/config/env.js";
import { createAuthService } from "../src/services/auth.js";
import { createApp } from "../src/app.js";
import { attachSocketServer } from "../src/socket/index.js";

export async function testDatabase() {
 const source = process.env.TEST_DATABASE_URL;
 if (!source) throw new Error("Set TEST_DATABASE_URL to a dedicated database ending in _test. Integration tests do not use DATABASE_URL.");
 const url = new URL(source);
 if (!url.pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end in _test");
 const schema = `test_${randomUUID().replaceAll("-", "")}`;
 const pool = new Pool({ connectionString: source, connectionTimeoutMillis: 5000 });
 await pool.query(`CREATE SCHEMA "${schema}"`);
 url.searchParams.set("schema", schema);
 try {
  await promisify(execFile)(process.execPath, ["../node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.toString() } });
 } catch { await pool.query(`DROP SCHEMA "${schema}" CASCADE`); await pool.end(); throw new Error("Test migration failed. Verify the dedicated test database is reachable."); }
 const db = createDatabase(url.toString());
 return { db, async close() { await db.$disconnect(); await pool.query(`DROP SCHEMA "${schema}" CASCADE`); await pool.end(); } };
}
import type { RoomService } from "../src/services/rooms.js";
import { createMatchService } from "../src/services/matches.js";
export async function testServer(db: Database, rooms?: RoomService, graceMs?: number, durationSeconds=180) {
 const config = parseEnv({ NODE_ENV: "test", MATCH_DURATION_SECONDS:String(durationSeconds) });
 const matches=createMatchService(db,durationSeconds);
 const auth = createAuthService(db, config);
 const server = createServer(createApp(config, auth,undefined,matches));
 const io = attachSocketServer(server, config, auth, rooms, graceMs, matches);
 await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
 const address = server.address();
 if (!address || typeof address === "string") throw new Error("Test listener failed");
 const url = `http://127.0.0.1:${address.port}`;
 const request = (path: string, method = "GET", body?: unknown, cookie?: string, headers: Record<string,string> = {}) => fetch(url + path, { method, headers: { Origin: config.frontendUrl, "X-Arena-Request": "1", "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
 return { url, config, auth, io, matches, request, close: async () => { await new Promise<void>(resolve => io.close(() => resolve())); await io.waitForCleanup(); } };
}
export const registration = { email: "player@example.com", username: "player_one", displayName: "Player One", password: "a unique arena passphrase 42" };
export function cookieFrom(response: Response) {
 const cookie = response.headers.get("set-cookie")?.split(";")[0];
 if (!cookie) throw new Error("Session cookie missing");
 return cookie;
}
