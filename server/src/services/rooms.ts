import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import type { RoomState, PublicRoom, RoomErrorCode, CreateRoomInput } from "@arena/shared";
import type { createOptionalRedis } from "../config/redis.js";
import { emptyQueue, type QueueStore } from "../matchmaking/state.js";
import { logger } from "../utils/logger.js";

type RedisClient = NonNullable<ReturnType<typeof createOptionalRedis>["client"]>;
export type RoomIdentity = { playerProfileId: string; username: string; displayName: string };
type StoredRoom = RoomState & { launchEndsAt?: number };
export interface LobbySnapshot { matchmaking?:QueueStore; rooms: Record<string, StoredRoom>; codes: Record<string,string>; playerRooms: Record<string,string>; }
export class RoomError extends Error {
 constructor(public readonly code: RoomErrorCode, message: string) { super(message); }
}
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRoomCode() { return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(""); }
export const roomSchemas = {
 empty: z.strictObject({}),
 create: z.strictObject({ name: z.string().trim().min(3).max(48).refine(value => !/[\p{Cc}\p{Cf}<>]/u.test(value)), visibility: z.enum(["PUBLIC", "PRIVATE"]), maxPlayers: z.number().int().min(2).max(8) }),
 join: z.strictObject({ roomId: z.string().uuid() }),
 code: z.strictObject({ code: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/) }),
 ready: z.strictObject({ ready: z.boolean() }),
};
export function roomInput<T>(schema: z.ZodType<T>, input: unknown): T {
 const result = schema.safeParse(input);
 if (!result.success) throw new RoomError("INVALID_INPUT", "Check the room details. Names need 3–48 characters, capacity 2–8 players, and codes six letters/numbers.");
 return result.data;
}
export function safeRoom(room: StoredRoom): RoomState {
 return { roomType: room.roomType, matchStartedAt: room.matchStartedAt, finishedAt: room.finishedAt, returnedPlayerProfileIds: room.returnedPlayerProfileIds, ...(room.gameId ? { gameId: room.gameId } : {}), id: room.id, code: room.code, name: room.name, visibility: room.visibility, status: room.status, hostPlayerProfileId: room.hostPlayerProfileId, maxPlayers: room.maxPlayers, createdAt: room.createdAt, players: room.players.map(p => ({ playerProfileId: p.playerProfileId, username: p.username, displayName: p.displayName, ready: p.ready, connected: p.connected, isHost: p.isHost, joinedAt: p.joinedAt })) };
}
export function publicRooms(snapshot: LobbySnapshot): PublicRoom[] {
 return Object.values(snapshot.rooms).filter(room => room.visibility === "PUBLIC" && room.status === "WAITING" && room.players.length < room.maxPlayers).map(room => ({ id: room.id, name: room.name, hostDisplayName: room.players.find(p => p.isHost)?.displayName ?? "Player", playerCount: room.players.length, maxPlayers: room.maxPlayers, status: room.status }));
}
const empty = (): LobbySnapshot => ({ rooms: {}, codes: {}, playerRooms: {} });
type Options = { key?: string; startDelayMs?: number; ttlSeconds?: number; heartbeatMs?: number; codeGenerator?: () => string; now?: () => number };
export function createRoomService(redis: () => RedisClient | undefined, options: Options = {}) {
 const now=options.now ?? Date.now;
 const key = options.key ?? `arena:lobby:v1:${randomUUID()}`;
 const queueKey=`${key}:matchmaking:v1`;
 const ttl = options.ttlSeconds ?? 120;
 const startDelay = options.startDelayMs ?? 2000;
 const codeGenerator = options.codeGenerator ?? generateRoomCode;
 let tail: Promise<unknown> = Promise.resolve();
 let closed = false;
 let holdsLiveState = false;
 let launcher: (room: RoomState) => Promise<string> = async () => new Date(now()).toISOString();
 let listener: (snapshot: LobbySnapshot, readyRoomId?: string) => Promise<void> = async () => {};
 const timers = new Set<ReturnType<typeof setTimeout>>();
 function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const run = tail.then(action); tail = run.catch(() => {}); return run;
 }
 async function execute<T>(action: (state: LobbySnapshot) => { result: T; readyRoomId?: string }, guard: () => boolean = () => true): Promise<T> {
  return enqueue(async () => {
   const client = redis();
   if (closed || !client) throw new RoomError("UNAVAILABLE", "The lobby is temporarily unavailable. Please try again.");
   let state: LobbySnapshot;
   try { const [raw,queue] = await client.mGet([key,queueKey]); if(holdsLiveState&&(!raw||!queue))throw new Error("Lobby namespace lost; restart server to recover"); state = raw ? JSON.parse(raw) as LobbySnapshot : empty(); state.matchmaking=queue?JSON.parse(queue) as QueueStore:emptyQueue(); }
   catch { throw new RoomError("UNAVAILABLE", "The lobby is temporarily unavailable. Please try again."); }
   if (!guard()) throw new RoomError("UNAUTHENTICATED", "This lobby connection is no longer active.");
   for (const room of Object.values(state.rooms)) {
    if (room.status === "STARTING" && (room.launchEndsAt ?? 0) <= now()) {
     room.matchStartedAt = await launcher(safeRoom(room)); room.status = "IN_GAME"; delete room.launchEndsAt;
    }
    if (room.status === "FINISHED" && now()-Date.parse(room.finishedAt!) >= 120000) reset(room,state);
   }
   const { result, readyRoomId } = action(state);
   // One process owns this namespace. All room/queue commands share this serial lane.
   // MULTI commits the separate documents together: assignment cannot leave a half-state.
   try { const {matchmaking,...lobby}=state; await client.multi().set(key,JSON.stringify(lobby),{EX:ttl}).set(queueKey,JSON.stringify(matchmaking),{EX:ttl}).exec(); holdsLiveState=Object.values(state.rooms).some(room=>!!room.gameId)||Object.keys(matchmaking?.entries??{}).length>0; }
   catch { throw new RoomError("UNAVAILABLE", "The lobby is temporarily unavailable. Reconnect to check your room."); }
   await listener(state, readyRoomId);
   return result;
  });
 }
 function reset(room: StoredRoom,state:LobbySnapshot) { if(room.roomType==="MATCHMAKING"){for(const p of room.players)delete state.playerRooms[p.playerProfileId];delete state.rooms[room.id];return;} room.status = "WAITING"; delete room.launchEndsAt; delete room.gameId; delete room.matchStartedAt; delete room.finishedAt; delete room.returnedPlayerProfileIds; for (const player of room.players) player.ready = false; }
 function current(state: LobbySnapshot, playerId: string) { const id = state.playerRooms[playerId]; return id ? state.rooms[id] : undefined; }
 function requireRoom(state: LobbySnapshot, id: string) { const room = current(state,id); if (!room) throw new RoomError("NOT_MEMBER", "Join a room first."); return room; }
 function waiting(room: StoredRoom) { if (room.status !== "WAITING") throw new RoomError("NOT_WAITING", "This room has already started."); }
 function eligible(state:LobbySnapshot,id:string) { if(state.matchmaking?.entries[id])throw new RoomError("NOT_WAITING","Cancel matchmaking before joining a manual room."); }
 function launch(room:StoredRoom){room.status="STARTING";room.gameId=randomUUID();room.launchEndsAt=now()+startDelay;}
 function join(state: LobbySnapshot, identity: RoomIdentity, room?: StoredRoom) {
  eligible(state,identity.playerProfileId);
  if (!room) throw new RoomError("NOT_FOUND", "No joinable room was found.");
  const existing = current(state,identity.playerProfileId);
  if (existing?.id === room.id) return safeRoom(existing);
  if (existing) throw new RoomError("ALREADY_IN_ROOM", "Leave your current room before joining another.");
  waiting(room);
  if (room.players.length >= room.maxPlayers) throw new RoomError("ROOM_FULL", "That room is full.");
  room.players.push({ playerProfileId: identity.playerProfileId, username: identity.username, displayName: identity.displayName, ready: false, connected: true, isHost: room.hostPlayerProfileId === identity.playerProfileId, joinedAt: new Date(now()).toISOString() });
  state.playerRooms[identity.playerProfileId] = room.id;
  return safeRoom(room);
 }
 const heartbeat = options.heartbeatMs === 0 ? undefined : setInterval(() => { void execute(() => ({ result: null })).catch(() => logger.warn("lobby.heartbeat_failed")); }, options.heartbeatMs ?? 30_000).unref();
 return {
  transact: execute,
  assign(state:LobbySnapshot,players:RoomIdentity[]) {
   if(players.length!==2 || players.some(p=>state.playerRooms[p.playerProfileId]))throw new RoomError("ALREADY_IN_ROOM","A player is already assigned.");
   if(Object.keys(state.rooms).length>=100)throw new RoomError("UNAVAILABLE","The lobby is at capacity.");
   const id=randomUUID(),host=players[0]!.playerProfileId,createdAt=new Date(now()).toISOString();
   const room:StoredRoom={id,roomType:"MATCHMAKING",code:"",name:"Matchmade Arena",visibility:"PRIVATE",maxPlayers:2,status:"WAITING",hostPlayerProfileId:host,createdAt,players:players.map(p=>({...p,ready:true,connected:true,isHost:p.playerProfileId===host,joinedAt:createdAt}))};
   state.rooms[id]=room;for(const p of players)state.playerRooms[p.playerProfileId]=id;launch(room);return safeRoom(room);
  },
  setLauncher(callback: typeof launcher) { launcher = callback; },
  finish(roomId: string, gameId: string) { return execute(state => { const room=state.rooms[roomId]; if(room?.gameId===gameId && room.status==="IN_GAME") {room.status="FINISHED";room.finishedAt=new Date(now()).toISOString();room.returnedPlayerProfileIds=[];} return {result:null}; }); },
  returnToLobby(playerId: string, guard?: () => boolean) { return execute(state => { const room=requireRoom(state,playerId); if(room.status!=="FINISHED") throw new RoomError("NOT_WAITING","Results are not ready."); const returned=room.returnedPlayerProfileIds ?? []; if(!returned.includes(playerId))returned.push(playerId);room.returnedPlayerProfileIds=returned; if(room.players.every(p=>returned.includes(p.playerProfileId)))reset(room,state);return {result:safeRoom(room)};},guard); },
  setListener(callback: typeof listener) { listener = callback; },
  connection(playerId: string, connected: boolean, guard?: () => boolean) {
   return execute(state => {
    const room = current(state,playerId);
    if (room) {
     const player = room.players.find(p => p.playerProfileId === playerId)!;
     if (player.connected !== connected) { player.ready = false; player.connected = connected; }
     if (!connected && room.status === "STARTING") reset(room,state);
    }
    return { result: room ? safeRoom(room) : null };
   },guard);
  },
  sync(playerId: string, guard?: () => boolean) { return execute(state => ({ result: current(state,playerId) ? safeRoom(current(state,playerId)!) : null }),guard); },
  list(guard?: () => boolean) { return execute(state => ({ result: publicRooms(state) }),guard); },
  create(identity: RoomIdentity, input: CreateRoomInput, guard?: () => boolean) {
   const data = roomInput(roomSchemas.create,input);
   return execute(state => {
    eligible(state,identity.playerProfileId);
    if (current(state,identity.playerProfileId)) throw new RoomError("ALREADY_IN_ROOM", "Leave your current room before creating another.");
    if (Object.keys(state.rooms).length >= 100) throw new RoomError("UNAVAILABLE", "The lobby is at capacity. Please try again later.");
    let code = "";
    for (let attempts=0; attempts<16; attempts++) { const candidate = codeGenerator(); if (!state.codes[candidate]) { code = candidate; break; } }
    if (!code) throw new RoomError("UNAVAILABLE", "Could not create a room code. Please try again.");
    const room: StoredRoom = { id: randomUUID(), code, ...data, status: "WAITING", hostPlayerProfileId: identity.playerProfileId, createdAt: new Date(now()).toISOString(), players: [] };
    state.rooms[room.id] = room; state.codes[code] = room.id;
    return { result: join(state,identity,room) };
   },guard);
  },
  join(identity: RoomIdentity, roomId: string, guard?: () => boolean) {
   return execute(state => { const room = state.rooms[roomId]; return { result: join(state,identity,room?.visibility === "PUBLIC" ? room : undefined) }; },guard);
  },
  joinCode(identity: RoomIdentity, code: string, guard?: () => boolean) {
   return execute(state => { const roomId = state.codes[code]; return { result: join(state,identity,roomId ? state.rooms[roomId] : undefined) }; },guard);
  },
  leave(playerId: string, guard?: () => boolean) {
   return execute(state => {
    const room = current(state,playerId);
    if (!room) return { result: null };
    room.players = room.players.filter(p => p.playerProfileId !== playerId); delete state.playerRooms[playerId];
    if (!room.players.length) { delete state.rooms[room.id]; delete state.codes[room.code]; }
    else {
     if (room.hostPlayerProfileId === playerId) room.hostPlayerProfileId = room.players[0]!.playerProfileId;
     for (const player of room.players) player.isHost = player.playerProfileId === room.hostPlayerProfileId;
     if (room.status === "STARTING" || (room.status === "FINISHED" && room.players.every(p=>room.returnedPlayerProfileIds?.includes(p.playerProfileId)))) reset(room,state);
    }
    return { result: null };
   },guard);
  },
  ready(playerId: string, ready: boolean, guard?: () => boolean) {
   return execute(state => { const room = requireRoom(state,playerId); waiting(room); room.players.find(p => p.playerProfileId === playerId)!.ready = ready; return { result: safeRoom(room) }; },guard);
  },
  async start(playerId: string, guard?: () => boolean) {
   const result = await execute(state => {
    const room = requireRoom(state,playerId); waiting(room);
    if (room.hostPlayerProfileId !== playerId) throw new RoomError("NOT_HOST", "Only the host can start the readiness check.");
    if (room.players.length < 2 || !room.players.every(p => p.ready && p.connected)) throw new RoomError("NOT_READY", "At least two players are required, and everyone including the host must be ready.");
    launch(room);
    return { result: safeRoom(room), readyRoomId: room.id };
   },guard);
   const timer = setTimeout(() => { timers.delete(timer); void execute(() => ({ result: null })).catch(() => logger.warn("lobby.start_transition_failed")); }, startDelay + 10).unref();
   timers.add(timer); return result;
  },
  async close() {
   closed = true; if (heartbeat) clearInterval(heartbeat); for (const timer of timers) clearTimeout(timer);
   await tail; const client = redis(); if (client) await client.del([key,queueKey]);
  },
 };
}
export type RoomService = ReturnType<typeof createRoomService>;
