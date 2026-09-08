import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "../types/socket.js";
import { logger } from "../utils/logger.js";
export function attachSocketServer(httpServer: HttpServer, frontendUrl: string) {
 const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: frontendUrl, methods: ["GET", "POST"] },
  maxHttpBufferSize: 16_384,
  allowRequest: (request, callback) => callback(null, !request.headers.origin || request.headers.origin === frontendUrl),
 });
 io.on("connection", socket => {
  logger.info("socket.connected", { socketId: socket.id });
  socket.on("system:ping", () => socket.emit("system:pong", { socketId: socket.id, timestamp: new Date().toISOString() }));
  socket.on("disconnect", reason => logger.info("socket.disconnected", { socketId: socket.id, reason }));
 });
 return io;
}
