"use client";
import dynamic from "next/dynamic";
import type { ArenaNetwork } from "@/game/network";
const GameCanvas = dynamic(() => import("@/game/game-canvas"), { ssr: false, loading: () => <p role="status">Loading arena engine…</p> });
export function GameLoader({ network }: { network: ArenaNetwork }) { return <GameCanvas network={network} />; }
