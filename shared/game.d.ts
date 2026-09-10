import type { GameInput, GamePlayer, GameSnapshot } from './index.js';
export const ARENA: Readonly<{ width: number; height: number; radius: number; speed: number }>;
export interface Position { x: number; y: number }
export function move(position: Position, input: Pick<GameInput, 'up' | 'down' | 'left' | 'right'>, seconds: number): Position;
export function reconcile(authoritative: GamePlayer, pending: GameInput[], tickRate: number): { position: Position; pending: GameInput[] };
export function interpolate(frames: GameSnapshot[], playerId: string, time: number): Position | null;
export interface CombatConfig { maxHealth: number; damage: number; projectileSpeed: number; projectileRadius: number; projectileLifetimeMs: number; fireCooldownMs: number; respawnDelayMs: number; muzzleOffset: number }
export const COMBAT: Readonly<CombatConfig>;
export function segmentCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, radius: number): number | null;
export function projectilePosition(projectile: import('./index.js').GameProjectile, elapsedMs: number): Position;
