import type { Metadata } from "next";
import { GameLoader } from "@/components/game-loader";
import { AuthGate } from "@/components/auth-gate";
import { SocketStatus } from "@/components/socket-status";
export const metadata: Metadata = { title: "Play" };
export default function Play() { return <AuthGate><main id="main" className="play-page"><p className="eyebrow">ENGINE PREVIEW</p><h1>The arena starts here.</h1><p>This is a local Phaser initialization preview. Multiplayer and gameplay are not available yet.</p><SocketStatus /><GameLoader /></main></AuthGate>; }
