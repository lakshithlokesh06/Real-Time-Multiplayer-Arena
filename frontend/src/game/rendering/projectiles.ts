import Phaser from "phaser";
import { COMBAT, projectilePosition } from "@arena/shared/game";
import type { ArenaNetwork } from "../network";
export class ProjectileRenderer {
 private bolts = new Map<string, Phaser.GameObjects.Container>();
 constructor(private readonly scene: Phaser.Scene, private readonly network: ArenaNetwork) {}
 update() {
  const projectiles = this.network.latest.projectiles;
  for (const [id, bolt] of this.bolts) if (!projectiles.some(p => p.id === id)) { bolt.destroy(); this.bolts.delete(id); }
  for (const projectile of projectiles) {
   let bolt = this.bolts.get(projectile.id);
   if (!bolt) {
    const halo = this.scene.add.circle(0, 0, COMBAT.projectileRadius + 5, 0xffcf78, 0.15);
    const tail = this.scene.add.rectangle(-6, 0, 19, 4, 0xffae56, 0.65);
    const core = this.scene.add.circle(0, 0, COMBAT.projectileRadius, 0xffedbd);
    bolt = this.scene.add.container(projectile.x, projectile.y, [halo, tail, core]).setDepth(3);
    this.bolts.set(projectile.id, bolt);
   }
   const position = projectilePosition(projectile, performance.now() - this.network.receivedAt);
   bolt.setPosition(position.x, position.y).setRotation(Math.atan2(projectile.directionY, projectile.directionX));
  }
 }
}
