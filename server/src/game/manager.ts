import { performance } from "node:perf_hooks";
import { z } from "zod";
import { ARENA, move } from "@arena/shared/game";
import type { GameInput, GamePlayer, GameSnapshot, RoomState } from "@arena/shared";
import type { LobbySnapshot } from "../services/rooms.js";
import { RoomError } from "../services/rooms.js";
export const inputSchema = z.strictObject({ gameId: z.string().uuid(), sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), up: z.boolean(), down: z.boolean(), left: z.boolean(), right: z.boolean() });
type Player = { state: GamePlayer; pending?: GameInput; received: number };
export class GameInstance {
 readonly players = new Map<string, Player>();
 tick = 0;
 constructor(readonly roomId: string, readonly gameId: string, room: RoomState, readonly tickRate: number) {
  room.players.forEach((player, index) => {
   const angle = index * Math.PI * 2 / room.players.length;
   this.players.set(player.playerProfileId, { received: 0, state: { playerProfileId: player.playerProfileId, username: player.username, displayName: player.displayName, connected: player.connected, x: ARENA.width / 2 + Math.cos(angle) * 230, y: ARENA.height / 2 + Math.sin(angle) * 230, lastSequence: 0 } });
  });
 }
 input(id: string, input: GameInput) {
  const player = this.players.get(id);
  if (!player?.state.connected) throw new RoomError("NOT_MEMBER", "You are not controlling a player in this game.");
  if (input.sequence <= player.received) return;
  player.received = input.sequence;
  // Coalesce to one intent per server tick. Packet spam never buys simulation time.
  player.pending = input;
 }
 freeze(id: string) { const p = this.players.get(id); if (p) { p.pending = undefined; p.received = p.state.lastSequence; p.state.connected = false; } }
 step() {
  this.tick++;
  for (const player of this.players.values()) {
   if (player.state.connected && player.pending) {
    Object.assign(player.state, move(player.state, player.pending, 1 / this.tickRate));
    player.state.lastSequence = player.pending.sequence;
   }
   player.pending = undefined;
  }
 }
 snapshot(serverTime = performance.now()): GameSnapshot {
  return { gameId: this.gameId, roomId: this.roomId, tick: this.tick, serverTime, tickRate: this.tickRate, snapshotRate: this.tickRate / Math.ceil(this.tickRate / 10), players: Array.from(this.players.values(), player => ({ ...player.state })) };
 }
}
export class GameManager {
 readonly games = new Map<string, GameInstance>();
 private timer?: ReturnType<typeof setTimeout>;
 constructor(readonly tickRate = 20, private readonly broadcast: (snapshot: GameSnapshot) => void = () => {}) {}
 reconcileRooms(snapshot: LobbySnapshot) {
  const live = new Set<string>();
  for (const room of Object.values(snapshot.rooms)) {
   if (room.status !== "IN_GAME" || !room.gameId) continue;
   live.add(room.gameId);
   let game = this.games.get(room.gameId);
   if (!game) { game = new GameInstance(room.id, room.gameId, room, this.tickRate); this.games.set(room.gameId, game); }
   for (const [id, player] of game.players) {
    const member = room.players.find(p => p.playerProfileId === id);
    if (!member) game.players.delete(id);
    else { if (!member.connected) game.freeze(id); player.state.connected = member.connected; }
   }
  }
  for (const id of this.games.keys()) if (!live.has(id)) this.games.delete(id);
 }
 sync(id: string) { for (const game of this.games.values()) if (game.players.has(id)) return game.snapshot(); return null; }
 freeze(id: string) { for (const game of this.games.values()) game.freeze(id); }
 remove(id: string) { for (const [key, game] of this.games) { game.players.delete(id); if (!game.players.size) this.games.delete(key); } }
 input(id: string, payload: unknown) {
  const parsed = inputSchema.safeParse(payload);
  if (!parsed.success) throw new RoomError("INVALID_INPUT", "Invalid movement input.");
  const game = this.games.get(parsed.data.gameId);
  if (!game) throw new RoomError("NOT_MEMBER", "No active game membership.");
  game.input(id, parsed.data);
 }
 step() { for (const game of this.games.values()) { game.step(); if (game.tick % Math.ceil(this.tickRate / 10) === 0) this.broadcast(game.snapshot()); } }
 start() {
  if (this.timer) return;
  const interval = 1000 / this.tickRate;
  let last = performance.now(), accumulator = 0;
  const pump = () => {
   const now = performance.now(); accumulator += Math.min(now - last, interval * 5); last = now;
   let steps = 0;
   while (accumulator >= interval && steps++ < 5) { this.step(); accumulator -= interval; }
   this.timer = setTimeout(pump, Math.max(1, interval - accumulator)).unref();
  };
  this.timer = setTimeout(pump, interval).unref();
 }
 close() { clearTimeout(this.timer); this.timer = undefined; this.games.clear(); }
}
