import type { CombatIntent, GameInput, GameSnapshot } from "@arena/shared";
import { reconcile, type Position } from "@arena/shared/game";
import type { ArenaSocket } from "@/services/socket";
/** Shared by React and one Phaser instance; React subscribes to snapshots; Phaser handles per-frame rendering. */
export class ArenaNetwork {
 frames: GameSnapshot[] = [];
 pending: GameInput[] = [];
 position: Position = { x: 0, y: 0 };
 sequence = 0;
 receivedAt = 0;
 latency = 0;
 combatSequence = 0;
 aim = { x: 1, y: 0 };
 private listeners = new Set<() => void>();
 subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
 getSnapshot = () => this.latest;
 constructor(readonly socket: ArenaSocket, readonly playerId: string, initial: GameSnapshot) { this.accept(initial); }
 get latest() { return this.frames[this.frames.length - 1]!; }
 accept(snapshot: GameSnapshot) {
  if (this.frames.length && (snapshot.gameId !== this.latest.gameId || snapshot.tick < this.latest.tick)) return;
  const self = snapshot.players.find(p => p.playerProfileId === this.playerId);
  if (!self) return;
  const correction = reconcile(self, this.pending, snapshot.tickRate);
  this.position = correction.position; this.pending = correction.pending;
  this.combatSequence = Math.max(this.combatSequence, self.lastCombatSequence);
  this.sequence = Math.max(this.sequence, self.lastSequence);
  this.frames.push(snapshot); if (this.frames.length > 24) this.frames.shift();
  this.receivedAt = performance.now();
  for (const listener of this.listeners) listener();
 }
 combat(fire: boolean, x: number, y: number) {
  const self = this.latest.players.find(p => p.playerProfileId === this.playerId);
  const length = Math.hypot(x, y);
  if (!self?.alive || !self.connected || !this.socket.connected || performance.now() - this.receivedAt > 1000 || length < 0.001) return;
  this.aim = { x: x / length, y: y / length };
  const intent: CombatIntent = { gameId: this.latest.gameId, life: self.life, sequence: ++this.combatSequence, aimX: this.aim.x, aimY: this.aim.y };
  this.socket.volatile.emit(fire ? "game:fire" : "game:aim", intent);
 }
 input(intent: Pick<GameInput, "up" | "down" | "left" | "right">) {
  if (!this.latest.players.find(p => p.playerProfileId === this.playerId)?.alive || !this.latest.players.find(p => p.playerProfileId === this.playerId)?.connected || !this.socket.connected || performance.now() - this.receivedAt > 1000 || this.pending.length >= 10) return;
  const input: GameInput = { ...intent, life: this.latest.players.find(p => p.playerProfileId === this.playerId)!.life, sequence: ++this.sequence, gameId: this.latest.gameId };
  this.pending.push(input);
  this.position = reconcile(this.latest.players.find(p => p.playerProfileId === this.playerId)!, this.pending, this.latest.tickRate).position;
  this.socket.volatile.emit("game:input", input);
 }
}
