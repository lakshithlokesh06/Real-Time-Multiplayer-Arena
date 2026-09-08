"use client";
import { useEffect, useRef, useState } from "react";
import type { createGame } from "./create-game";
import type { ArenaNetwork } from "./network";
export default function GameCanvas({ network }: { network: ArenaNetwork }) {
 const container = useRef<HTMLDivElement>(null);
 const [failed, setFailed] = useState(false);
 useEffect(() => {
  if (!container.current) return;
  let game: ReturnType<typeof createGame> | undefined;
  let disposed = false;
  void import("./create-game").then(({ createGame }) => {
   if (!disposed && container.current) game = createGame(container.current, network);
  }).catch(() => { if (!disposed) setFailed(true); });
  return () => { disposed = true; game?.destroy(true); };
 }, [network]);
 return <section className="arena-canvas" aria-label="Multiplayer arena" tabIndex={0}>{failed ? <p role="alert">The game engine could not initialize. Try a browser with WebGL or Canvas support.</p> : <div ref={container} />}</section>;
}
