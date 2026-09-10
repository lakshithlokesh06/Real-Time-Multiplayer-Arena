import Phaser from "phaser";
import { COMBAT } from "@arena/shared/game";
import type { ArenaNetwork } from "./network";
/** Canvas owns pointer fire; holding a button that began on React UI never fires. */
export class ArenaInput {
 private keys: Record<string, Phaser.Input.Keyboard.Key>;
 private elapsed = 0;
 private held = false;
 private nextFire = 0;
 constructor(private readonly scene: Phaser.Scene, private readonly network: ArenaNetwork) {
  this.keys = scene.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT", false) as typeof this.keys;
  const down = (pointer: Phaser.Input.Pointer) => {
   if (!pointer.leftButtonDown() || pointer.event.target !== scene.game.canvas) return;
   scene.game.canvas.parentElement?.closest<HTMLElement>(".arena-canvas")?.focus({ preventScroll: true });
   this.held = true; this.sendFire(pointer);
  };
  const release = () => { this.held = false; };
  const preventScroll = (event: KeyboardEvent) => { if (event.key.startsWith("Arrow") && this.focused()) event.preventDefault(); };
  scene.input.on("pointerdown", down); scene.input.on("pointerup", release); scene.input.on("gameout", release);
  window.addEventListener("blur", release); window.addEventListener("pointerup", release); window.addEventListener("keydown", preventScroll);
  scene.events.once("shutdown", () => {
   scene.input.off("pointerdown", down); scene.input.off("pointerup", release); scene.input.off("gameout", release);
   window.removeEventListener("blur", release); window.removeEventListener("pointerup", release); window.removeEventListener("keydown", preventScroll);
  });
 }
 private sendFire(pointer: Phaser.Input.Pointer) {
  const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  this.network.combat(true, world.x - this.network.position.x, world.y - this.network.position.y);
  this.nextFire = performance.now() + COMBAT.fireCooldownMs;
 }
 private focused() { return document.hasFocus() && !!document.activeElement?.closest(".arena-canvas"); }
 update(delta: number) {
  const focused = this.focused();
  if (!focused || !this.network.latest.players.find(p => p.playerProfileId === this.network.playerId)?.alive) this.held = false;
  const pointer = this.scene.input.activePointer;
  const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  const aimX = world.x - this.network.position.x, aimY = world.y - this.network.position.y;
  const interval = 1000 / this.network.latest.tickRate;
  this.elapsed = Math.min(this.elapsed + delta, interval * 2);
  while (this.elapsed >= interval) {
   const down = (...names: string[]) => focused && names.some(name => this.keys?.[name]?.isDown);
   this.network.input({ up: down("W", "UP"), down: down("S", "DOWN"), left: down("A", "LEFT"), right: down("D", "RIGHT") });
   if (focused && this.scene.input.manager.isOver) this.network.combat(false, aimX, aimY);
   this.elapsed -= interval;
  }
  if (this.held && this.scene.input.manager.isOver && performance.now() >= this.nextFire) {
   this.sendFire(pointer);
  }
 }
}
