import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "../types/socket.js";
import type { AuthService } from "../services/auth.js";
import type { Environment } from "../config/env.js";
import { readSessionCookie } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";
export function attachSocketServer(httpServer: HttpServer, config: Environment, auth: AuthService) {
 const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: config.frontendUrl, credentials: true, methods: ["GET", "POST"] },
  maxHttpBufferSize: 16_384,
  allowRequest: (request, callback) => callback(null, request.headers.origin === config.frontendUrl),
 });
 io.use(async (socket, next) => {
  try {
   const identity = await auth.resolve(readSessionCookie(socket.request.headers.cookie, config));
   if (!identity) { next(new Error("Authentication required.")); return; }
   const { player, sessionId } = identity;
   socket.data = { sessionId, userId: player.id, playerProfileId: player.profile.id, username: player.profile.username, displayName: player.profile.displayName };
   next();
  } catch { next(new Error("Authentication unavailable.")); }
 });
 const unsubscribe = auth.onRevoked(id => {
  for (const socket of io.sockets.sockets.values()) if (socket.data.sessionId === id) socket.disconnect(true);
 });
 httpServer.once("close", unsubscribe);
 io.on("connection", socket => {
  logger.info("socket.connected", { socketId: socket.id });
  let checking = false;
  const checkSession = async () => {
   try { if (!await auth.sessionActive(socket.data.sessionId)) { socket.disconnect(true); return false; } return true; }
   catch { socket.disconnect(true); return false; }
  };
  // Revalidate idle connections too: expiration/revocation cannot keep an idle socket alive indefinitely.
  const interval = setInterval(() => { void checkSession(); }, 30_000).unref();
  socket.on("system:ping", async () => {
   if (checking) return;
   checking = true;
   try { if (await checkSession() && socket.connected) socket.emit("system:pong", { socketId: socket.id, timestamp: new Date().toISOString() }); }
   finally { checking = false; }
  });
  socket.on("disconnect", reason => { clearInterval(interval); logger.info("socket.disconnected", { socketId: socket.id, reason }); });
 });
 return io;
}
