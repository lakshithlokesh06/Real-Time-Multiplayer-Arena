import type { Server, Socket } from "socket.io";
import type { z } from "zod";
import type { Ack, ClientToServerEvents, ServerToClientEvents } from "@arena/shared";
import type { SocketData } from "../types/socket.js";
import type { AuthService } from "../services/auth.js";
import { RoomError, roomInput, roomSchemas, publicRooms, safeRoom, type RoomService } from "../services/rooms.js";
import { GameManager } from "../game/manager.js";
import type { MatchService } from "../services/matches.js";
import { retryLifecycle } from "../services/match-finalization.js";
import { logger } from "../utils/logger.js";
type LobbySocket = Socket<ClientToServerEvents,ServerToClientEvents,Record<string,never>,SocketData>;
type LobbyServer = Server<ClientToServerEvents,ServerToClientEvents,Record<string,never>,SocketData>;
export function configureLobby(io: LobbyServer, auth: AuthService, rooms?: RoomService, graceMs = 5000, tickRate = 20, matches?: MatchService, durationSeconds = 180) {
 const jobs = new Set<Promise<void>>();
 if(matches)rooms?.setLauncher(room=>matches.start(room));
 const broadcast = (snapshot: import("@arena/shared").GameSnapshot) => io.to(`lobby:room:${snapshot.roomId}`).emit("game:state",snapshot);
 const games = new GameManager(tickRate, broadcast, {durationSeconds,onFinish:game=>{
  game.persistence=matches?"SAVING":"SAVED";
  broadcast(game.snapshot());
  const job=(async()=>{
   const save=matches ? retryLifecycle(()=>matches.finish(game.result!),"match.persist_failed") : Promise.resolve(true);
   const metadata=rooms ? retryLifecycle(()=>rooms.finish(game.roomId,game.gameId),"match.room_finish_failed") : Promise.resolve(true);
   const [saved]=await Promise.all([save,metadata]);game.persistence=saved?"SAVED":"FAILED";if(games.games.get(game.gameId)===game)broadcast(game.snapshot());
  })();jobs.add(job);void job.finally(()=>jobs.delete(job));
 }});
 games.start();
 let closing = false;
 const controllers = new Map<string,LobbySocket>();
 const departures = new Map<string,ReturnType<typeof setTimeout>>();
 const limits = new Map<string,{ start: number; count: number; creates: number; createStart: number }>();
 const limiterCleanup = setInterval(() => { for (const [id,limit] of limits) if (Date.now()-limit.createStart > 120000 && Date.now()-limit.start > 120000) limits.delete(id); },60000).unref();
 rooms?.setListener(async (state, readyRoomId) => {
  if(closing)return;
  for (const [id,socket] of controllers) {
   if (!socket.connected) continue;
   const roomId = state.playerRooms[id];
   for (const channel of socket.rooms) if (channel.startsWith("lobby:room:") && channel !== `lobby:room:${roomId}`) await socket.leave(channel);
   if (roomId) await socket.join(`lobby:room:${roomId}`);
   else socket.emit("room:state",null);
  }
  games.reconcileRooms(state);
  for (const room of Object.values(state.rooms)) io.to(`lobby:room:${room.id}`).emit("room:state",safeRoom(room));
  for(const [id,socket] of controllers) {const snapshot=games.sync(id);if(socket.connected && snapshot?.match.status==="FINISHED")socket.emit("game:state",snapshot);}
  io.emit("rooms:list",publicRooms(state));
  if (readyRoomId) io.to(`lobby:room:${readyRoomId}`).emit("room:ready-to-start",{ roomId: readyRoomId, message: "Launching arena…" });
 });
 io.on("connection",socket => {
  const id = socket.data.playerProfileId;
  const previous = controllers.get(id);
  games.freeze(id);
  controllers.set(id,socket);
  clearTimeout(departures.get(id)); departures.delete(id);
  if (previous && previous !== socket) { previous.emit("lobby:replaced"); previous.disconnect(true); }
  const active = () => socket.connected && controllers.get(id) === socket;
  if (rooms) void rooms.connection(id,true,active).catch(() => { if (active()) { socket.emit("room:state",null); socket.emit("rooms:list",[]); } });
  let pending = 0;
  function command<T,R>(schema: z.ZodType<T>, action: (service: RoomService, payload: T) => Promise<R>, create = false) {
   return (payload: T, ack: Ack<R>) => {
    if (typeof ack !== "function") return;
    void (async () => {
     let counted = false;
     try {
      if (!active()) throw new RoomError("UNAUTHENTICATED","This lobby connection is no longer active.");
      const now = Date.now();
      const limit = limits.get(id) ?? { start: now, count: 0, creates: 0, createStart: now };
      if (now-limit.start >= 10000) { limit.start = now; limit.count = 0; }
      if (now-limit.createStart >= 60000) { limit.createStart = now; limit.creates = 0; }
      limits.set(id,limit);
      if (++limit.count > 40 || (create && ++limit.creates > 3) || pending >= 8) throw new RoomError("RATE_LIMITED","Too many room commands. Wait a moment and try again.");
      pending++; counted = true;
      const input = roomInput(schema,payload);
      if (!await auth.sessionActive(socket.data.sessionId)) { socket.disconnect(true); throw new RoomError("UNAUTHENTICATED","Please sign in again."); }
      if (!rooms) throw new RoomError("UNAVAILABLE","The lobby is temporarily unavailable.");
      const result = await action(rooms,input); ack({ ok: true, data: result });
     } catch(error) {
      const safe = error instanceof RoomError ? error : new RoomError("UNAVAILABLE","The lobby is temporarily unavailable. Please try again.");
      ack({ ok: false, error: { code: safe.code, message: safe.message } });
     } finally { if (counted) pending--; }
    })();
   };
  }
  let inputWindow = performance.now(), inputCount = 0, lastError = -Infinity;
  socket.on("game:input", payload => {
   if (!active()) return;
   const now = performance.now();
   if (now - inputWindow >= 1000) { inputWindow = now; inputCount = 0; }
   try {
    if (++inputCount > tickRate * 2 + 10) throw new RoomError("RATE_LIMITED", "Movement input rate exceeded.");
    if (Date.now() >= socket.data.sessionExpiresAt) { socket.disconnect(true); return; }
    games.input(id, payload);
   } catch (error) {
    if (now - lastError >= 1000) { const safe = error instanceof RoomError ? error : new RoomError("INVALID_INPUT", "Invalid movement input."); socket.emit("game:error", { code: safe.code, message: safe.message }); lastError = now; }
   }
  });
  let combatWindow = performance.now(), combatCount = 0;
  const combat = (fire: boolean) => (payload: import("@arena/shared").CombatIntent) => {
   if (!active()) return;
   const now = performance.now();
   if (now - combatWindow >= 1000) { combatWindow = now; combatCount = 0; }
   try {
    if (Date.now() >= socket.data.sessionExpiresAt) { socket.disconnect(true); return; }
    if (++combatCount > 60) throw new RoomError("RATE_LIMITED", "Combat input rate exceeded.");
    games.combatIntent(id, payload, fire);
   } catch (error) {
    if (now - lastError >= 1000) { const safe = error instanceof RoomError ? error : new RoomError("INVALID_INPUT", "Invalid combat intent."); socket.emit("game:error", { code: safe.code, message: safe.message }); lastError = now; }
   }
  };
  socket.on("game:aim", combat(false));
  socket.on("game:fire", combat(true));
  socket.on("game:sync",command(roomSchemas.empty, async service => { await service.sync(id,active); return games.sync(id); }));
  socket.on("game:leave",command(roomSchemas.empty,service => service.leave(id,active)));
  socket.on("rooms:list",command(roomSchemas.empty,service => service.list(active)));
  socket.on("room:sync",command(roomSchemas.empty,service => service.sync(id,active)));
  socket.on("room:create",command(roomSchemas.create,(service,input) => service.create(socket.data,input,active),true));
  socket.on("room:join",command(roomSchemas.join,(service,input) => service.join(socket.data,input.roomId,active)));
  socket.on("room:join-code",command(roomSchemas.code,(service,input) => service.joinCode(socket.data,input.code,active)));
  socket.on("room:leave",command(roomSchemas.empty,service => service.leave(id,active)));
  socket.on("room:set-ready",command(roomSchemas.ready,(service,input) => service.ready(id,input.ready,active)));
  socket.on("room:return",command(roomSchemas.empty,service=>service.returnToLobby(id,active)));
  socket.on("room:start",command(roomSchemas.empty,service => service.start(id,active)));
  socket.on("disconnect",reason => {
   if (controllers.get(id) !== socket) return;
   games.freeze(id);
   if (reason === "server shutting down") { controllers.delete(id); return; }
   const stillDeparted = () => controllers.get(id) === socket && !socket.connected;
   const leave = () => {
    departures.delete(id);
    games.remove(id);
    void rooms?.leave(id,stillDeparted).catch(() => { if (!closing) logger.warn("lobby.disconnect_cleanup_failed"); }).finally(() => { if (stillDeparted()) controllers.delete(id); });
    if (!rooms) controllers.delete(id);
   };
   if (reason === "client namespace disconnect" || reason === "server namespace disconnect") leave();
   else {
    void rooms?.connection(id,false,stillDeparted).catch(() => logger.warn("lobby.disconnect_mark_failed"));
    departures.set(id,setTimeout(leave,graceMs).unref());
   }
  });
 });
 return async () => {
  closing = true; games.close();
  clearInterval(limiterCleanup); for (const timer of departures.values()) clearTimeout(timer); departures.clear(); controllers.clear();
  await Promise.allSettled(jobs);
  await rooms?.close();
 };
}
