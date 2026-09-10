export const ARENA = Object.freeze({ width: 1600, height: 900, radius: 18, speed: 260 });
export function move(position, input, seconds) {
 let dx = Number(input.right) - Number(input.left), dy = Number(input.down) - Number(input.up);
 const length = Math.hypot(dx, dy);
 if (length) { dx /= length; dy /= length; }
 return { x: Math.max(ARENA.radius, Math.min(ARENA.width - ARENA.radius, position.x + dx * ARENA.speed * seconds)), y: Math.max(ARENA.radius, Math.min(ARENA.height - ARENA.radius, position.y + dy * ARENA.speed * seconds)) };
}
export function reconcile(authoritative, pending, tickRate) {
 const remaining = authoritative.alive === false ? [] : pending.filter(input => input.sequence > authoritative.lastSequence && (input.life ?? 0) === (authoritative.life ?? 0));
 return { position: remaining.reduce((position, input) => move(position, input, 1 / tickRate), { x: authoritative.x, y: authoritative.y }), pending: remaining };
}
export function interpolate(frames, playerId, time) {
 if (!frames.length) return null;
 const latest = frames[frames.length - 1];
 // Membership comes from the latest snapshot: removed players never linger.
 if (!latest.players.some(p => p.playerProfileId === playerId)) return null;
 let before = frames[0], after = latest;
 for (const frame of frames) { if (frame.serverTime <= time) before = frame; if (frame.serverTime >= time) { after = frame; break; } }
 const a = before.players.find(p => p.playerProfileId === playerId), b = after.players.find(p => p.playerProfileId === playerId);
 if (!a || !b) return b ?? a ?? null;
 if (a.life !== latest.players.find(p => p.playerProfileId === playerId).life || a.alive !== latest.players.find(p => p.playerProfileId === playerId).alive || a.life !== b.life || a.alive !== b.alive) return latest.players.find(p => p.playerProfileId === playerId);
 const fraction = Math.max(0, Math.min(1, (time - before.serverTime) / (after.serverTime - before.serverTime || 1)));
 return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
}
export const COMBAT = Object.freeze({ maxHealth: 100, damage: 25, projectileSpeed: 800, projectileRadius: 5, projectileLifetimeMs: 2000, fireCooldownMs: 300, respawnDelayMs: 3000, muzzleOffset: 26 });
/** Earliest intersection of a swept point with a circle, including a start inside it. */
export function segmentCircle(ax, ay, bx, by, cx, cy, radius) {
 const dx = bx - ax, dy = by - ay, ox = ax - cx, oy = ay - cy;
 const c = ox * ox + oy * oy - radius * radius;
 if (c <= 0) return 0;
 const a = dx * dx + dy * dy;
 if (a === 0) return null;
 const b = 2 * (ox * dx + oy * dy), discriminant = b * b - 4 * a * c;
 if (discriminant < 0) return null;
 const t = (-b - Math.sqrt(discriminant)) / (2 * a);
 return t >= 0 && t <= 1 ? t : null;
}
/** Bounded visual advancement only; existence and removal always follow latest authority. */
export function projectilePosition(projectile, elapsedMs) {
 const seconds = Math.max(0, Math.min(100, elapsedMs)) / 1000;
 return { x: Math.max(0, Math.min(ARENA.width, projectile.x + projectile.directionX * COMBAT.projectileSpeed * seconds)), y: Math.max(0, Math.min(ARENA.height, projectile.y + projectile.directionY * COMBAT.projectileSpeed * seconds)) };
}
