export const ARENA = Object.freeze({ width: 1600, height: 900, radius: 18, speed: 260 });
export function move(position, input, seconds) {
 let dx = Number(input.right) - Number(input.left), dy = Number(input.down) - Number(input.up);
 const length = Math.hypot(dx, dy);
 if (length) { dx /= length; dy /= length; }
 return { x: Math.max(ARENA.radius, Math.min(ARENA.width - ARENA.radius, position.x + dx * ARENA.speed * seconds)), y: Math.max(ARENA.radius, Math.min(ARENA.height - ARENA.radius, position.y + dy * ARENA.speed * seconds)) };
}
export function reconcile(authoritative, pending, tickRate) {
 const remaining = pending.filter(input => input.sequence > authoritative.lastSequence);
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
 const fraction = Math.max(0, Math.min(1, (time - before.serverTime) / (after.serverTime - before.serverTime || 1)));
 return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
}
