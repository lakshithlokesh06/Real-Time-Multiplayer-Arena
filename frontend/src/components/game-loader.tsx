"use client";
import dynamic from "next/dynamic";
const GameCanvas = dynamic(() => import("@/game/game-canvas"), { ssr: false, loading: () => <p role="status">Loading arena engine…</p> });
export function GameLoader() { return <GameCanvas />; }
