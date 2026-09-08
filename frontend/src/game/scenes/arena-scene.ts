import Phaser from "phaser";
import { ARENA, interpolate } from "@arena/shared/game";
import type { ArenaNetwork } from "../network";
export class ArenaScene extends Phaser.Scene {
 private markers = new Map<string, Phaser.GameObjects.Container>();
 private keys?: Record<string, Phaser.Input.Keyboard.Key>;
 private elapsed = 0;
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
  this.keys = this.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT", false) as typeof this.keys;
  const preventScroll = (event: KeyboardEvent) => {
   if (event.key.startsWith("Arrow") && document.activeElement?.closest(".arena-canvas")) event.preventDefault();
  };
  window.addEventListener("keydown", preventScroll);
  this.events.once("shutdown", () => window.removeEventListener("keydown", preventScroll));
  this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
  this.cameras.main.setRoundPixels(false);
  const resize = () => this.cameras.main.setZoom(Math.min(1, this.scale.width / 700, this.scale.height / 420));
  resize(); this.scale.on("resize", resize);
  this.events.once("shutdown", () => this.scale.off("resize", resize));
 }
 update(_time: number, delta: number) {
  const interval = 1000 / this.network.latest.tickRate;
  this.elapsed = Math.min(this.elapsed + delta, interval * 2);
  const focused = document.hasFocus() && !["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(document.activeElement?.tagName ?? "");
  while (this.elapsed >= interval) {
   const down = (...names: string[]) => focused && names.some(name => this.keys?.[name]?.isDown);
   this.network.input({ up: down("W", "UP"), down: down("S", "DOWN"), left: down("A", "LEFT"), right: down("D", "RIGHT") });
   this.elapsed -= interval;
  }
  const snapshot = this.network.latest;
  const renderTime = snapshot.serverTime + Math.min(performance.now() - this.network.receivedAt, 250) - 120;
  for (const [id, marker] of this.markers) if (!snapshot.players.some(p => p.playerProfileId === id)) { marker.destroy(); this.markers.delete(id); }
  for (const player of snapshot.players) {
   const local = player.playerProfileId === this.network.playerId;
   let marker = this.markers.get(player.playerProfileId);
   if (!marker) {
    const ring = this.add.circle(0, 0, ARENA.radius + 6).setStrokeStyle(local ? 2 : 1, local ? 0xd5ff84 : 0x73c4e0, 0.7);
    const body = this.add.circle(0, 0, ARENA.radius, local ? 0xc4f279 : 0x69b9d7).setStrokeStyle(3, 0x172932);
    const label = this.add.text(0, -43, `${player.displayName}${local ? " · You" : ""}`, { fontFamily: "sans-serif", fontSize: "14px", color: "#f4f8ed", backgroundColor: "#101d24dd", padding: { x: 7, y: 4 } }).setOrigin(0.5);
    const chevron = this.add.triangle(0, 0, -5, 4, 0, -5, 5, 4, 0x183126);
    marker = this.add.container(player.x, player.y, [ring, body, label, chevron]); this.markers.set(player.playerProfileId, marker);
    if (local) { this.cameras.main.startFollow(marker, false, 0.12, 0.12); this.cameras.main.centerOn(player.x, player.y); }
   }
   const position = local ? this.network.position : interpolate(this.network.frames, player.playerProfileId, renderTime);
   if (position) {
    const blend = local ? 1 - Math.exp(-delta / 25) : 1;
    marker.setPosition(marker.x + (position.x - marker.x) * blend, marker.y + (position.y - marker.y) * blend);
   }
   const label = marker.list[2] as Phaser.GameObjects.Text;
   label.setScale(1 / this.cameras.main.zoom).setY(player.y < 65 ? 43 : -43);
   marker.setAlpha(player.connected ? 1 : 0.4);
  }
 }
}
