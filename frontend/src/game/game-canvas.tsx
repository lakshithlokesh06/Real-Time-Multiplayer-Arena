"use client";
import { useEffect, useRef, useState } from "react";
import type { createGame } from "./create-game";
export default function GameCanvas() {
 const container = useRef<HTMLDivElement>(null);
 const [failed, setFailed] = useState(false);
 useEffect(() => {
  if (!container.current) return;
  let game: ReturnType<typeof createGame> | undefined;
  let disposed = false;
  void import("./create-game").then(({ createGame }) => {
   if (!disposed && container.current) game = createGame(container.current);
  }).catch(() => { if (!disposed) setFailed(true); });
  return () => { disposed = true; game?.destroy(true); };
 }, []);
 return <section className="game-shell" aria-label="Arena engine preview">{failed ? <p role="alert">The game engine could not initialize. Try a browser with WebGL or Canvas support.</p> : <><div ref={container} /><p className="game-caption">Engine preview only · No playable mechanics</p></>}</section>;
}
