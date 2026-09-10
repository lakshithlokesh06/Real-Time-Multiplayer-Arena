import Phaser from "phaser";
import { ARENA, interpolate } from "@arena/shared/game";
import type { ArenaNetwork } from "../network";
type Marker = { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text; barrel: Phaser.GameObjects.Rectangle; health: Phaser.GameObjects.Graphics; previousHealth: number; life: number; flashUntil: number };
export class PlayerRenderer {
 private markers = new Map<string, Marker>();
 constructor(private readonly scene: Phaser.Scene, private readonly network: ArenaNetwork) {}
 update(delta: number, renderTime: number) {
  const snapshot = this.network.latest;
  for (const [id, marker] of this.markers) if (!snapshot.players.some(p => p.playerProfileId === id)) { marker.container.destroy(); this.markers.delete(id); }
  for (const player of snapshot.players) {
   const local = player.playerProfileId === this.network.playerId;
   let marker = this.markers.get(player.playerProfileId);
   if (!marker) {
    const ring = this.scene.add.circle(0, 0, ARENA.radius + 6).setStrokeStyle(local ? 2 : 1, local ? 0xd5ff84 : 0x73c4e0, 0.7);
    const body = this.scene.add.circle(0, 0, ARENA.radius, local ? 0xc4f279 : 0x69b9d7).setStrokeStyle(3, 0x172932);
    const label = this.scene.add.text(0, -53, "", { fontFamily: "sans-serif", fontSize: "13px", color: "#f4f8ed", backgroundColor: "#101d24dd", padding: { x: 5, y: 3 } }).setOrigin(0.5);
    const barrel = this.scene.add.rectangle(0, 0, 31, 7, 0xe5f2d6).setOrigin(0, 0.5);
    const health = this.scene.add.graphics();
    const container = this.scene.add.container(player.x, player.y, [ring, barrel, body, label, health]);
    marker = { container, body, label, barrel, health, previousHealth: player.health, life: player.life, flashUntil: 0 }; this.markers.set(player.playerProfileId, marker);
    if (local) { this.scene.cameras.main.startFollow(container, false, 0.12, 0.12); this.scene.cameras.main.centerOn(player.x, player.y); }
   }
   const position = local ? this.network.position : interpolate(this.network.frames, player.playerProfileId, renderTime);
   if (position) {
    const blend = local && marker.life === player.life ? 1 - Math.exp(-delta / 25) : 1;
    marker.container.setPosition(marker.container.x + (position.x - marker.container.x) * blend, marker.container.y + (position.y - marker.container.y) * blend);
   }
   if (player.health < marker.previousHealth) marker.flashUntil = performance.now() + 180;
   marker.body.setFillStyle(performance.now() < marker.flashUntil ? 0xffffff : local ? 0xc4f279 : 0x69b9d7);
   marker.previousHealth = player.health; marker.life = player.life;
   const aim = local ? this.network.aim : { x: player.aimX, y: player.aimY };
   marker.barrel.setRotation(Math.atan2(aim.y, aim.x)).setVisible(player.alive);
   marker.label.setText(`${player.displayName}${local ? " · You" : ""}${player.alive ? "" : " · Respawning"}`);
   marker.label.setScale(1 / this.scene.cameras.main.zoom).setY(player.y < 80 ? 53 : -53);
   marker.health.clear(); marker.health.setScale(1 / this.scene.cameras.main.zoom).setY(player.y < 80 ? 31 : -31);
   marker.health.fillStyle(0x081016).fillRect(-23, -3, 46, 7);
   marker.health.fillStyle(local ? 0xc4f279 : 0x69b9d7).fillRect(-22, -2, 44 * player.health / player.maxHealth, 5);
   marker.container.setAlpha(!player.alive ? 0.55 : player.connected ? 1 : 0.5);
  }
 }
}
