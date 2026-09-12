"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {api} from '@/services/api';
import type {LeaderboardData} from '@/types/competitive';
import {useAuth} from './auth-provider';
export function RankedLeaderboard(){
 const {player}=useAuth();const [page,setPage]=useState(1),[retry,setRetry]=useState(0);
 const [result,setResult]=useState<{page:number;data?:LeaderboardData;error?:string}|null>(null);
 useEffect(()=>{let active=true;api<LeaderboardData>(`/api/leaderboard?page=${page}&limit=25`).then(data=>{if(active)setResult({page,data});}).catch(()=>{if(active)setResult({page,error:'Rankings are temporarily unavailable.'});});return()=>{active=false;};},[page,retry,player?.profile.id]);
 const current=result?.page===page?result:null,data=current?.data;
 return <main id="main" className="player-page leaderboard-page"><p className="eyebrow">COMPETITIVE ARENA</p><h1>Ranked Leaderboard</h1><p>Rankings follow rated matchmaking MMR. Complete one rated match to earn your place.</p>{current?.error?<p role="alert">{current.error} <button className="button secondary" onClick={()=>{setResult(null);setRetry(r=>r+1);}}>Retry</button></p>:!data?<p role="status">Loading rankings…</p>:<><div className="leaderboard-summary"><strong>{data.ownRank?`Your rank #${data.ownRank}`:'You are Unranked'}</strong><span>{data.total} ranked players</span><Link href="/play">Find a rated match ↗</Link></div>{!data.players.length?<p>{data.total?'No players on this page.':'No rated players yet. Be the first to complete a rated match.'}</p>:<ol className="ranking-list" start={(page-1)*25+1}>{data.players.map(p=><li key={p.playerProfileId} className={p.playerProfileId===player?.profile.id?'ranking-card is-self':'ranking-card'}><div className="rank-number">#{p.rank}</div><div className="rank-identity"><h2>{p.displayName} {p.playerProfileId===player?.profile.id&&<small>You</small>}</h2><span className="pill">{p.division.name}</span></div><dl>{[['MMR',p.mmr],['Wins',p.wins],['Losses',p.losses],['Ties',p.ties],['Win rate',`${p.winRate.toFixed(1)}%`],['K/D',p.kd.toFixed(2)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></li>)}</ol>}<nav className="ranking-pagination" aria-label="Leaderboard pages"><button className="button secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {Math.max(1,data.totalPages)}</span><button className="button secondary" disabled={page>=data.totalPages} onClick={()=>setPage(p=>p+1)}>Next</button></nav></>}</main>;
}
