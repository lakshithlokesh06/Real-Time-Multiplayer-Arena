import { performance } from "node:perf_hooks";
import { z } from "zod";
import { ARENA, COMBAT, move } from "@arena/shared/game";
import type { GameInput, GameSnapshot, RoomState, MatchResult } from "@arena/shared";
import type { LobbySnapshot } from "../services/rooms.js";
import { RoomError } from "../services/rooms.js";
import { CombatSimulation, combatSchema } from "./combat.js";
import type { PlayerRuntime } from "./player.js";
import { standings } from "./match.js";
export type MatchOptions = { durationSeconds?: number; now?: () => number; wallNow?: () => number; onFinish?: (game: GameInstance) => void };
export const inputSchema = z.strictObject({ life: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(), gameId: z.string().uuid(), sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), up: z.boolean(), down: z.boolean(), left: z.boolean(), right: z.boolean() });
export class GameInstance {
 readonly players = new Map<string, PlayerRuntime>();
 private readonly name: string;
 readonly combat: CombatSimulation;
 readonly participants = new Map<string, PlayerRuntime>();
 readonly departed = new Set<string>();
 readonly startedAt: string;
 readonly durationSeconds: number;
 readonly deadline: number;
 private readonly now: () => number;
 result: MatchResult | null = null;
 persistence: "SAVING" | "SAVED" | "FAILED" = "SAVED";
 tick = 0;
 constructor(readonly roomId: string, readonly gameId: string, room: RoomState, readonly tickRate: number, private readonly options: MatchOptions = {}) {
  this.now = options.now ?? performance.now.bind(performance);
  const wall = (options.wallNow ?? Date.now)();
  this.startedAt = room.matchStartedAt ?? new Date(wall).toISOString();
  this.durationSeconds = options.durationSeconds ?? 180;
  this.deadline = this.now() + this.durationSeconds*1000 - Math.max(0,wall-Date.parse(this.startedAt));
  this.name = room.name;
  this.combat = new CombatSimulation(this.players, tickRate);
  room.players.forEach((player, index) => {
   const angle = index * Math.PI * 2 / room.players.length;
   this.players.set(player.playerProfileId, { received: 0, nextShotTick: 0, respawnTick: 0, previousX: 0, previousY: 0, state: { score: 0, health: COMBAT.maxHealth, maxHealth: COMBAT.maxHealth, alive: true, respawnInMs: 0, eliminations: 0, deaths: 0, aimX: 1, aimY: 0, life: 0, lastCombatSequence: 0, playerProfileId: player.playerProfileId, username: player.username, displayName: player.displayName, connected: player.connected, x: ARENA.width / 2 + Math.cos(angle) * 230, y: ARENA.height / 2 + Math.sin(angle) * 230, lastSequence: 0 } });
  });
  for(const [id,p] of this.players)this.participants.set(id,p);
 }
 get remainingMs() { return this.result ? 0 : Math.max(0,Math.ceil(this.deadline-this.now())); }
 finishIfDue() { if(!this.result && this.remainingMs===0)this.finish("TIME_LIMIT");return !!this.result; }
 finish(reason: MatchResult["endReason"] = "TIME_LIMIT") {
  if(this.result)return;
  this.combat.stop();
  const elapsed=reason==="TIME_LIMIT" ? this.durationSeconds*1000 : Math.max(0,this.durationSeconds*1000-this.remainingMs);
  const ranking=standings(Array.from(this.participants,([id,p])=>({playerProfileId:id,username:p.state.username,displayName:p.state.displayName,score:p.state.score,eliminations:p.state.eliminations,deaths:p.state.deaths,leftEarly:this.departed.has(id)})),reason==="TIME_LIMIT");
  this.result={matchId:this.gameId,roomId:this.roomId,roomName:this.roomName,startedAt:this.startedAt,endedAt:new Date(Date.parse(this.startedAt)+elapsed).toISOString(),durationSeconds:Math.floor(elapsed/1000),endReason:reason,...ranking};
  this.result.standings.forEach(Object.freeze);Object.freeze(this.result.standings);Object.freeze(this.result);
  this.options.onFinish?.(this);
 }
 private get roomName() { return this.name; }
 input(id: string, input: GameInput) {
  if(this.finishIfDue())return;
  const player = this.players.get(id);
  if (!player?.state.connected) throw new RoomError("NOT_MEMBER", "You are not controlling a player in this game.");
  if (!player.state.alive || (input.life ?? 0) !== player.state.life) return;
  if (input.sequence <= player.received) return;
  player.received = input.sequence;
  // Coalesce to one intent per server tick. Packet spam never buys simulation time.
  player.pending = input;
 }
 freeze(id: string) { const p = this.players.get(id); if (p) { p.pending = undefined; p.pendingFire = undefined; p.received = p.state.lastSequence; p.state.connected = false; } }
 step() {
  if(this.finishIfDue())return;
  this.tick++;
  this.combat.respawn(this.tick);
  for (const player of this.players.values()) {
   player.previousX = player.state.x; player.previousY = player.state.y;
   if (player.state.connected && player.pending) {
    Object.assign(player.state, move(player.state, player.pending, 1 / this.tickRate));
    player.state.lastSequence = player.pending.sequence;
   }
   player.pending = undefined;
  }
  this.combat.step(this.tick);
 }
 remove(id: string) { if(!this.result && this.players.has(id))this.departed.add(id); this.combat.removeOwner(id); this.players.delete(id); }
 snapshot(serverTime = performance.now()): GameSnapshot {
  return { match: {status:this.result?"FINISHED":"IN_GAME",startedAt:this.startedAt,durationSeconds:this.durationSeconds,remainingMs:this.remainingMs,result:this.result ? structuredClone(this.result) : null,persistence:this.persistence}, gameId: this.gameId, roomId: this.roomId, tick: this.tick, serverTime, tickRate: this.tickRate, snapshotRate: this.tickRate / Math.ceil(this.tickRate / 10), projectiles: this.combat.snapshot(), players: Array.from(this.players.values(), player => ({ ...player.state })) };
 }
}
export class GameManager {
 private readonly retired = new Set<string>();
 readonly games = new Map<string, GameInstance>();
 private timer?: ReturnType<typeof setTimeout>;
 constructor(readonly tickRate = 20, private readonly broadcast: (snapshot: GameSnapshot) => void = () => {}, private readonly options: MatchOptions = {}) {}
 reconcileRooms(snapshot: LobbySnapshot) {
  const live = new Set<string>();
  for (const room of Object.values(snapshot.rooms)) {
   if (!["IN_GAME","FINISHED"].includes(room.status) || !room.gameId) continue;
   live.add(room.gameId);
   if(this.retired.has(room.gameId))continue;
   let game = this.games.get(room.gameId);
   if(!game && room.status==="FINISHED")continue;
   if (!game) { game = new GameInstance(room.id, room.gameId, room, this.tickRate, this.options); this.games.set(room.gameId, game); }
   for (const [id, player] of game.players) {
    const member = room.players.find(p => p.playerProfileId === id);
    if (!member) game.remove(id);
    else { if (!member.connected) game.freeze(id); player.state.connected = member.connected; }
   }
  }
  for(const id of this.retired)if(!live.has(id))this.retired.delete(id);
  for (const id of this.games.keys()) if (!live.has(id)) { const game=this.games.get(id)!; if(!game.result)game.finish("EMPTY_ROOM");this.games.delete(id); }
 }
 sync(id: string) { for (const game of this.games.values()) if (game.players.has(id)) return game.snapshot(); return null; }
 freeze(id: string) { for (const game of this.games.values()) game.freeze(id); }
 remove(id: string) { for (const [key, game] of this.games) { game.remove(id); if (!game.players.size) {game.finish("EMPTY_ROOM");this.retired.add(key);this.games.delete(key);} } }
 input(id: string, payload: unknown) {
  const parsed = inputSchema.safeParse(payload);
  if (!parsed.success) throw new RoomError("INVALID_INPUT", "Invalid movement input.");
  const game = this.games.get(parsed.data.gameId);
  if (!game) throw new RoomError("NOT_MEMBER", "No active game membership.");
  game.input(id, parsed.data);
 }
 combatIntent(id: string, payload: unknown, fire: boolean) {
  const parsed = combatSchema.safeParse(payload);
  if (!parsed.success) throw new RoomError("INVALID_INPUT", "Invalid combat intent.");
  const game = this.games.get(parsed.data.gameId);
  if (!game) throw new RoomError("NOT_MEMBER", "No active game membership.");
  if(!game.finishIfDue())game.combat.intent(id, parsed.data, fire, game.tick);
 }
 step() { for (const game of this.games.values()) { const wasFinished=!!game.result;game.step(); if (!wasFinished && game.tick % Math.ceil(this.tickRate / 10) === 0) this.broadcast(game.snapshot()); } }
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
 close() { clearTimeout(this.timer); this.timer = undefined; this.games.clear();this.retired.clear(); }
}
