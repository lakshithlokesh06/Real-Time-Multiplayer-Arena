import Phaser from "phaser";
import { BootScene } from "./scenes/boot-scene";
export function createGame(parent: HTMLDivElement) {
 return new Phaser.Game({ type: Phaser.AUTO, parent, backgroundColor: "#101916", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 480 }, scene: [BootScene], banner: false, audio: { noAudio: true } });
}
