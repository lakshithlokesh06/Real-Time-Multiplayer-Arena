import Phaser from "phaser";
import { ArenaScene } from "./scenes/arena-scene";
import type { ArenaNetwork } from "./network";
export function createGame(parent: HTMLDivElement, network: ArenaNetwork) {
 return new Phaser.Game({ type: Phaser.AUTO, parent, backgroundColor: "#101916", scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight }, scene: [new ArenaScene(network)], banner: false, audio: { noAudio: true } });
}
