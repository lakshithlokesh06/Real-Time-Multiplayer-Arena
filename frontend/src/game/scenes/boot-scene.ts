import Phaser from "phaser";
export class BootScene extends Phaser.Scene {
 constructor() { super("boot"); }
 create() {
  const grid = this.add.graphics().lineStyle(1, 0x253a31, 0.6);
  for (let x=0; x<=960; x+=48) grid.lineBetween(x,0,x,480);
  for (let y=0; y<=480; y+=48) grid.lineBetween(0,y,960,y);
  this.add.text(480,215,"ARENA / ENGINE READY",{ fontFamily:"monospace",fontSize:"28px",color:"#b7f568" }).setOrigin(0.5);
  this.add.text(480,260,"Awaiting the next phase.",{ fontFamily:"sans-serif",fontSize:"18px",color:"#a5b5ac" }).setOrigin(0.5);
 }
}
