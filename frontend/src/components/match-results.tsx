"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { MatchResult } from "@arena/shared";
import type { ArenaNetwork } from "@/game/network";
import { ArenaHUD } from "./arena-hud";
export function Standings({ result, playerId }: {result:MatchResult;playerId:string}) {
 return <div className="standings-scroll"><table className="standings"><caption>Final standings · {result.durationSeconds}s played</caption><thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col">Score</th><th scope="col">Eliminations</th><th scope="col">Deaths</th></tr></thead><tbody>{result.standings.map(p=><tr key={p.playerProfileId} data-self={p.playerProfileId===playerId}><td>{p.placement}</td><th scope="row">{p.displayName} {p.playerProfileId===playerId && <span className="pill">You</span>} {p.isWinner && <span className="pill">{result.tied?"Tied winner":"Winner"}</span>}{p.leftEarly && <small>Left early</small>}</th><td>{p.score}</td><td>{p.eliminations}</td><td>{p.deaths}</td></tr>)}</tbody></table></div>;
}
export function resultTitle(result:MatchResult) {return result.endReason==="EMPTY_ROOM"?"Room emptied":result.tied?"A tied finish":`${result.standings.find(p=>p.isWinner)?.displayName ?? "Player"} wins`;}
export function MatchView(props:{network:ArenaNetwork;name:string;count:number;connection:string;leave:()=>void;busy:boolean;error:string;returnToLobby:()=>void}) {
 const snapshot=useSyncExternalStore(props.network.subscribe,props.network.getSnapshot,props.network.getSnapshot);
 const result=snapshot.match.result;
 if(!result)return <ArenaHUD {...props}/>;
 const self=result.standings.find(p=>p.playerProfileId===props.network.playerId);
 return <main id="main" className="player-page match-results"><p className="eyebrow">{result.roomName}</p><h1>Match Complete</h1><div className="result-banner"><p>{resultTitle(result)}</p><h2>Your placement: #{self?.placement}</h2><span>{self?.score} {self?.score===1?"point":"points"} · {result.durationSeconds}s match</span></div><Standings result={result} playerId={props.network.playerId}/><p role="status">{snapshot.match.persistence==="SAVED"?"Results saved to match history.":snapshot.match.persistence==="FAILED"?"Results could not be saved. These standings remain available until the room resets.":"Saving results…"}</p>{props.error&&<p role="alert">{props.error}</p>}<div className="actions"><button className="button primary" onClick={props.returnToLobby} disabled={props.busy}>Return to Lobby</button><button className="button secondary" onClick={props.leave} disabled={props.busy}>Leave Room</button><Link href="/matches">Match history ↗</Link></div><p className="field-help">The room resets after everyone returns, or after two minutes. Ready again for a fresh match.</p></main>;
}
