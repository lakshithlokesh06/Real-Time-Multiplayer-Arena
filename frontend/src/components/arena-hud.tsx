"use client";
import { useEffect, useState } from "react";
import type { ArenaNetwork } from "@/game/network";
import { GameLoader } from "./game-loader";
function Diagnostics({ network }: { network: ArenaNetwork }) {
 const [, render] = useState(0);
 useEffect(() => { const timer = setInterval(() => render(value => value + 1), 200); return () => clearInterval(timer); }, []);
 const snapshot = network.latest;
 const self = snapshot.players.find(p => p.playerProfileId === network.playerId)!;
 return <pre className="arena-debug" aria-label="Network diagnostics">{`Tick ${snapshot.tick} · ${snapshot.tickRate} Hz simulation / ${snapshot.snapshotRate} Hz snapshots\nRTT ${Math.round(network.latency)} ms · pending ${network.pending.length}\nPredicted ${network.position.x.toFixed(1)}, ${network.position.y.toFixed(1)}\nAuthoritative ${self.x.toFixed(1)}, ${self.y.toFixed(1)}\n${snapshot.players.map(p => `${p.displayName}: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}${p.connected ? "" : " (reconnecting)"}`).join("\n")}`}</pre>;
}
export function ArenaHUD({ network, name, count, connection, leave, busy, error }: { network: ArenaNetwork; name: string; count: number; connection: string; leave: () => void; busy: boolean; error: string }) {
 const [debug, setDebug] = useState(false);
 return <main id="main" className="player-page arena-page"><header className="arena-hud"><div><p className="eyebrow">LIVE ARENA</p><h1>{name}</h1><p role="status">{count} players · {connection}</p></div><button className="button button-secondary" onClick={leave} disabled={busy}>Leave Arena</button></header>{error && <p role="alert">{error}</p>}<GameLoader network={network} /><div className="arena-controls"><p>Move: WASD / Arrow Keys <span>· Click the arena to focus</span></p><button className="button button-secondary" aria-pressed={debug} onClick={() => setDebug(!debug)}>Network debug</button></div>{debug && <Diagnostics network={network} />}</main>;
}
