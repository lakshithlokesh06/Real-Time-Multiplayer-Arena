import { createClient } from "redis";
import { logger } from "../utils/logger.js";
export function createOptionalRedis(url?: string) {
 const client = url ? createClient({ url, socket: { connectTimeout: 1500, reconnectStrategy: false } }) : undefined;
 client?.on("error", () => logger.warn("redis.unavailable"));
 return {
  get client() { return client?.isReady ? client : undefined; },
  get status() { return !client ? "disabled" : client.isReady ? "ready" : "unavailable"; },
  async connect() {
   if (!client) return;
   try { await client.connect(); logger.info("redis.connected"); }
   catch { logger.warn("redis.optional_connection_failed"); }
  },
  close() { if (client?.isOpen) client.destroy(); },
 };
}
