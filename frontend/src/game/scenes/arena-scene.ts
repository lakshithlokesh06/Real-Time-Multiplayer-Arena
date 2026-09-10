import Phaser from "phaser";
import { ARENA } from "@arena/shared/game";
import type { ArenaNetwork } from "../network";
import { ArenaInput } from "../input";
import { PlayerRenderer } from "../rendering/players";
import { ProjectileRenderer } from "../rendering/projectiles";
export class ArenaScene extends Phaser.Scene {
 private controls?: ArenaInput;
 private players?: PlayerRenderer;
 private projectiles?: ProjectileRenderer;
 constructor(private readonly network: ArenaNetwork) { super("Arena"); }
 create() {
  const floor = this.add.graphics();
  floor.fillStyle(0x101d24); floor.fillRect(0, 0, ARENA.width, ARENA.height);
  floor.lineStyle(1, 0x23353c, 0.7);
  for (let x = 0; x <= ARENA.width; x += 50) floor.lineBetween(x, 0, x, ARENA.height);
  for (let y = 0; y <= ARENA.height; y += 50) floor.lineBetween(0, y, ARENA.width, y);
  floor.lineStyle(3, 0xa8d76b, 0.6); floor.strokeRect(2, 2, ARENA.width - 4, ARENA.height - 4);
  floor.lineStyle(2, 0x4b676a, 0.7); floor.strokeCircle(ARENA.width / 2, ARENA.height / 2, 120);
  floor.lineBetween(ARENA.width / 2 - 18, ARENA.height / 2, ARENA.width / 2 + 18, ARENA.height / 2);
  floor.lineBetween(ARENA.width / 2, ARENA.height / 2 - 18, ARENA.width / 2, ARENA.height / 2 + 18);
  this.add.text(36, 34, "ARENA / 01", { fontFamily: "monospace", fontSize: "18px", color: "#69838b", letterSpacing: 3 });
  this.controls = new ArenaInput(this, this.network);
  this.players = new PlayerRenderer(this, this.network);
  this.projectiles = new ProjectileRenderer(this, this.network);
  this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
  this.cameras.main.setRoundPixels(false);
  const resize = () => this.cameras.main.setZoom(Math.min(1, this.scale.width / 700, this.scale.height / 420));
  resize(); this.scale.on("resize", resize);
  this.events.once("shutdown", () => this.scale.off("resize", resize));
 }
 update(_time: number, delta: number) {
  this.controls?.update(delta);
  const snapshot = this.network.latest;
  const renderTime = snapshot.serverTime + Math.min(performance.now() - this.network.receivedAt, 250) - 120;
  this.players?.update(delta, renderTime);
  this.projectiles?.update();
 }
}
