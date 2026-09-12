"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {api} from '@/services/api';
import type {CompetitiveSummary as Summary,Division} from '@/types/competitive';
import {useAuth} from './auth-provider';
export function DivisionProgress({division}:{division:Division}){
 return <div className="division-progress"><span className="pill">{division.name}</span><h3>{division.mmr} <small>MMR</small></h3><progress aria-label={`Progress through ${division.name}`} value={division.progress} max={1}/><p>{division.nextDivision?`${division.mmrRequired} MMR to ${division.nextDivision}`:'Highest division · Master'}</p></div>;
}
export function CompetitiveSummary({compact=false}:{compact?:boolean}){
 const {player}=useAuth();
 const [data,setData]=useState<Summary|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;api<Summary>('/api/statistics/me').then(value=>{if(active){setData(value);setError('');}}).catch(()=>{if(active)setError('Competitive statistics are unavailable.');});return()=>{active=false;};},[player?.profile.id,retry]);
 return <section className="competitive-summary" aria-label="Competitive summary"><div className="competitive-heading"><h2>Your competitive record</h2><Link href="/leaderboard">Leaderboard ↗</Link></div>{error?<p role="alert">{error} <button onClick={()=>setRetry(r=>r+1)}>Retry</button></p>:!data?<p role="status">Loading competitive record…</p>:<><div className="competitive-grid"><DivisionProgress division={data.division}/><dl className="competitive-metrics">{[
 ['Rank',data.rank?`#${data.rank}`:'Unranked'],['Peak MMR',data.peakMmr],['Rated matches',data.ratedMatches],['Record',`${data.wins} W / ${data.losses} L / ${data.ties} T`],['Win rate',`${data.winRate.toFixed(1)}%`],['K/D',data.kd.toFixed(2)],...(!compact?[['Eliminations',data.eliminations],['Deaths',data.deaths],['Win streak',data.currentWinStreak],['Best streak',data.bestWinStreak]]:[])
 ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div><div className="recent-form"><h3>Recent rated form</h3>{data.recentForm.length?<><div aria-label="Latest five rated outcomes, newest first">{data.recentForm.map(m=><span className={`form-outcome outcome-${m.outcome}`} title={`${m.outcome==='W'?'Win':m.outcome==='L'?'Loss':'Tie'} · ${new Date(m.endedAt).toLocaleString()}`} key={m.matchId}>{m.outcome}</span>)}</div><p className="field-help">Newest first · Latest rated match {new Date(data.recentForm[0].endedAt).toLocaleString()}</p></>:<p>Complete a rated match to begin your competitive record.</p>}</div>{!data.rank&&<p className="field-help">Unranked · Complete one rated matchmaking match to enter the leaderboard.</p>}{!compact&&<p className="field-help">Career: {data.totalMatches} completed matches · {data.unratedMatches} unrated · {data.overallEliminations} eliminations / {data.overallDeaths} deaths. Ranked metrics above include matchmaking only.</p>}</>}</section>;
}
