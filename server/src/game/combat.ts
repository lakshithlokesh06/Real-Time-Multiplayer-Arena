import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ARENA, COMBAT, segmentCircle, type CombatConfig } from "@arena/shared/game";
import type { CombatIntent, GameProjectile } from "@arena/shared";
import { RoomError } from "../services/rooms.js";
import type { PlayerRuntime } from "./player.js";
export const combatSchema = z.strictObject({ gameId: z.string().uuid(), life: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), aimX: z.number().min(-1).max(1), aimY: z.number().min(-1).max(1) }).refine(p => Math.hypot(p.aimX, p.aimY) >= 0.001, "Aim must have direction");
export interface Projectile extends GameProjectile { createdTick: number; expiresTick: number; damage: number; speed: number }
export function respawnPosition(players: Iterable<PlayerRuntime>, selfId: string) {
 const living = Array.from(players).filter(p => p.state.alive && p.state.playerProfileId !== selfId);
 let best = { x: ARENA.width / 2, y: ARENA.height / 2 }, bestDistance = -1;
 // Stable candidate order is the tie breaker. All candidates stay well inside the world.
 for (const y of [100, ARENA.height / 2, ARENA.height - 100]) for (const x of [100, ARENA.width / 2, ARENA.width - 100]) {
  const distance = living.reduce((nearest, p) => Math.min(nearest, Math.hypot(x - p.state.x, y - p.state.y)), Infinity);
  if (distance > bestDistance) { bestDistance = distance; best = { x, y }; }
 }
 return best;
}
export class CombatSimulation {
 readonly projectiles = new Map<string, Projectile>();
 constructor(private readonly players: Map<string, PlayerRuntime>, readonly tickRate: number, readonly config: Readonly<CombatConfig> = COMBAT) {}
 intent(id: string, intent: CombatIntent, fire: boolean, tick: number) {
  const player = this.players.get(id);
  if (!player?.state.connected) throw new RoomError("NOT_MEMBER", "Combat control is unavailable for this player life.");
  // Normal in-flight packets can arrive after elimination or across a respawn.
  if (!player.state.alive || intent.life !== player.state.life) return;
  if (intent.sequence <= player.state.lastCombatSequence) return;
  const length = Math.hypot(intent.aimX, intent.aimY);
  const normalized = { ...intent, aimX: intent.aimX / length, aimY: intent.aimY / length };
  player.state.lastCombatSequence = intent.sequence;
  player.state.aimX = normalized.aimX; player.state.aimY = normalized.aimY;
  if (fire && tick + 1 >= player.nextShotTick) player.pendingFire = normalized;
 }
 respawn(tick: number) {
  for (const player of this.players.values()) {
   if (player.state.alive) continue;
   player.state.respawnInMs = Math.max(0, (player.respawnTick - tick) * 1000 / this.tickRate);
   if (tick < player.respawnTick) continue;
   Object.assign(player.state, respawnPosition(this.players.values(), player.state.playerProfileId), { health: this.config.maxHealth, alive: true, respawnInMs: 0, aimX: 1, aimY: 0, life: player.state.life + 1 });
   player.pending = undefined; player.pendingFire = undefined; player.nextShotTick = tick;
   player.state.lastSequence = player.received;
  }
 }
 step(tick: number) {
  for (const [id, projectile] of this.projectiles) {
   if (tick >= projectile.expiresTick) { this.projectiles.delete(id); continue; }
   const x = projectile.x + projectile.directionX * projectile.speed / this.tickRate;
   const y = projectile.y + projectile.directionY * projectile.speed / this.tickRate;
   let target: PlayerRuntime | undefined, first = Infinity;
   for (const player of this.players.values()) {
    const state = player.state;
    if (!state.alive || state.playerProfileId === projectile.ownerPlayerProfileId) continue;
    // Sweep in the target's relative frame: crossing a moving target also registers.
    const hit = segmentCircle(projectile.x - player.previousX, projectile.y - player.previousY, x - state.x, y - state.y, 0, 0, ARENA.radius + this.config.projectileRadius);
    if (hit !== null && hit < first) { first = hit; target = player; }
   }
   if (target) { this.damage(target, projectile, tick); this.projectiles.delete(id); }
   else if (x < 0 || y < 0 || x > ARENA.width || y > ARENA.height) this.projectiles.delete(id);
   else { projectile.x = x; projectile.y = y; }
  }
  for (const player of this.players.values()) {
   const shot = player.pendingFire; player.pendingFire = undefined;
   if (!shot || !player.state.alive || !player.state.connected || shot.life !== player.state.life || tick < player.nextShotTick) continue;
   const id = randomUUID();
   // Start the authoritative sweep at the muzzle. Clamp muzzle positions at edges.
   const x = Math.max(0, Math.min(ARENA.width, player.state.x + shot.aimX * this.config.muzzleOffset));
   const y = Math.max(0, Math.min(ARENA.height, player.state.y + shot.aimY * this.config.muzzleOffset));
   const projectile: Projectile = { id, ownerPlayerProfileId: player.state.playerProfileId, x, y, directionX: shot.aimX, directionY: shot.aimY, speed: this.config.projectileSpeed, damage: this.config.damage, createdTick: tick, expiresTick: tick + Math.ceil(this.config.projectileLifetimeMs * this.tickRate / 1000) };
   // Resolve the short muzzle segment too, so overlapping/nearby opponents cannot be skipped.
   let target: PlayerRuntime | undefined, first = Infinity;
   for (const candidate of this.players.values()) {
    if (!candidate.state.alive || candidate === player) continue;
    const t = segmentCircle(player.state.x, player.state.y, x, y, candidate.state.x, candidate.state.y, ARENA.radius + this.config.projectileRadius);
    if (t !== null && t < first) { first = t; target = candidate; }
   }
   if (target) this.damage(target, projectile, tick); else this.projectiles.set(id, projectile);
   player.nextShotTick = tick + Math.ceil(this.config.fireCooldownMs * this.tickRate / 1000);
  }
 }
 private damage(target: PlayerRuntime, projectile: Projectile, tick: number) {
  if (!target.state.alive) return;
  target.state.health = Math.max(0, target.state.health - projectile.damage);
  if (target.state.health > 0) return;
  target.state.alive = false; target.state.deaths++;
  target.respawnTick = tick + Math.ceil(this.config.respawnDelayMs * this.tickRate / 1000);
  target.state.respawnInMs = (target.respawnTick - tick) * 1000 / this.tickRate;
  target.pending = undefined; target.pendingFire = undefined; target.state.lastSequence = target.received;
  const owner = this.players.get(projectile.ownerPlayerProfileId);
  if (owner && owner !== target) owner.state.eliminations++;
 }
 removeOwner(id: string) { for (const [key, projectile] of this.projectiles) if (projectile.ownerPlayerProfileId === id) this.projectiles.delete(key); }
 snapshot(): GameProjectile[] { return Array.from(this.projectiles.values(), p => ({ id: p.id, ownerPlayerProfileId: p.ownerPlayerProfileId, x: p.x, y: p.y, directionX: p.directionX, directionY: p.directionY })); }
}
