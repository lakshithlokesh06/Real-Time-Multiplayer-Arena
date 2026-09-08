import type { GameInput, GameSnapshot } from "@arena/shared";
import { reconcile, type Position } from "@arena/shared/game";
import type { ArenaSocket } from "@/services/socket";
/** Shared by React and one Phaser instance; snapshots never trigger React frame renders. */
export class ArenaNetwork {
 frames: GameSnapshot[] = [];
 pending: GameInput[] = [];
 position: Position = { x: 0, y: 0 };
 sequence = 0;
 receivedAt = 0;
 latency = 0;
 constructor(readonly socket: ArenaSocket, readonly playerId: string, initial: GameSnapshot) { this.accept(initial); }
 get latest() { return this.frames[this.frames.length - 1]!; }
 accept(snapshot: GameSnapshot) {
  if (this.frames.length && (snapshot.gameId !== this.latest.gameId || snapshot.tick < this.latest.tick)) return;
  const self = snapshot.players.find(p => p.playerProfileId === this.playerId);
  if (!self) return;
  const correction = reconcile(self, this.pending, snapshot.tickRate);
  this.position = correction.position; this.pending = correction.pending;
  this.sequence = Math.max(this.sequence, self.lastSequence);
  this.frames.push(snapshot); if (this.frames.length > 24) this.frames.shift();
  this.receivedAt = performance.now();
 }
 input(intent: Pick<GameInput, "up" | "down" | "left" | "right">) {
  if (!this.socket.connected || performance.now() - this.receivedAt > 1000 || this.pending.length >= 10) return;
  const input: GameInput = { ...intent, sequence: ++this.sequence, gameId: this.latest.gameId };
  this.pending.push(input);
  this.position = reconcile(this.latest.players.find(p => p.playerProfileId === this.playerId)!, this.pending, this.latest.tickRate).position;
  this.socket.volatile.emit("game:input", input);
 }
}
