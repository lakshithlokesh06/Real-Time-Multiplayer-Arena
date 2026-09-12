"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MatchResult } from "@arena/shared";
import { api } from "@/services/api";
import { useAuth } from "./auth-provider";
import { RatingChange, Standings, resultTitle } from "./match-results";
export function MatchHistory({compact=false}:{compact?:boolean}) {
 const {player}=useAuth();
 const [matches,setMatches]=useState<MatchResult[]|null>(null),[error,setError]=useState(""),[generation,setGeneration]=useState(0);
 useEffect(()=>{let cancelled=false;void api<{matches:MatchResult[]}>(`/api/matches?limit=${compact?1:20}`).then(data=>{if(!cancelled){setMatches(data.matches);setError("");}}).catch(()=>{if(!cancelled)setError("Match history is temporarily unavailable.");});return()=>{cancelled=true;};},[player?.profile.id,compact,generation]);
 return <section className="match-history" aria-label={compact?"Latest completed match":"Match history"}><h2>{compact?"Latest match":"Recent completed matches"}</h2>{error?<p role="alert">{error} <button className="button secondary" onClick={()=>setGeneration(g=>g+1)}>Retry</button></p>:matches===null?<p role="status">Loading matches…</p>:!matches.length?<p>No completed matches yet. Your next arena result will appear here.</p>:matches.map(match=>{const self=match.standings.find(p=>p.playerProfileId===player?.profile.id);return <article className="history-card" key={match.matchId}><div><p className="eyebrow">{new Date(match.endedAt).toLocaleString()}</p><h3>{match.roomName}</h3><span className="pill">{match.roomType==="MATCHMAKING"?"Rated matchmaking":"Unrated manual"}{match.endReason==="EMPTY_ROOM"?" · Abandoned":""}</span><p>{resultTitle(match)} · Placement #{self?.placement}</p><p>Score {self?.score} · {self?.eliminations} eliminations · {self?.deaths} deaths · {match.durationSeconds}s</p><RatingChange standing={self}/></div>{!compact&&<details><summary>View standings</summary><Standings result={match} playerId={player!.profile.id}/></details>}</article>;})}{compact&&<Link href="/matches">All recent matches ↗</Link>}</section>;
}
