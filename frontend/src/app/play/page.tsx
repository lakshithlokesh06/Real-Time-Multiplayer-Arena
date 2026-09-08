import type { Metadata } from "next";
import { GameLoader } from "@/components/game-loader";
export const metadata: Metadata = { title: "Play" };
export default function Play() { return <main id="main" className="play-page"><p className="eyebrow">ENGINE PREVIEW</p><h1>The arena starts here.</h1><p>This is a local Phaser initialization preview. Multiplayer and gameplay are not available yet.</p><GameLoader /></main>; }
