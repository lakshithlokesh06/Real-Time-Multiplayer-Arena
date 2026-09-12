import type { Database } from '../config/database.js';
import { Prisma } from '../generated/prisma/client.js';
import {division,kd,winRate,outcome} from './competitive.js';
const eligible=Prisma.sql`SELECT p.id, p."displayName", p.rating AS mmr,
 s."ratedMatches", s."ratedWins", s."ratedLosses", s."ratedTies", s."ratedEliminations", s."ratedDeaths",
 s."ratedWins"::numeric / NULLIF(s."ratedMatches",0) AS ratio
 FROM "PlayerProfile" p JOIN "PlayerStatistics" s ON s."playerProfileId"=p.id WHERE s."ratedMatches">0`;
type Row={id:string;displayName:string;mmr:number;ratedMatches:number;ratedWins:number;ratedLosses:number;ratedTies:number;ratedEliminations:number;ratedDeaths:number};
const present=(r:Row)=>({playerProfileId:r.id,displayName:r.displayName,mmr:r.mmr,division:division(r.mmr),ratedMatches:r.ratedMatches,wins:r.ratedWins,losses:r.ratedLosses,ties:r.ratedTies,eliminations:r.ratedEliminations,deaths:r.ratedDeaths,winRate:winRate(r.ratedWins,r.ratedMatches),kd:kd(r.ratedEliminations,r.ratedDeaths)});
export function createStatisticsService(db:Database){
 async function rank(tx:Prisma.TransactionClient,id:string){
  const rows=await tx.$queryRaw<{rank:number}[]>(Prisma.sql`WITH eligible AS (${eligible}) SELECT (1+(SELECT count(*) FROM eligible e WHERE e.mmr>me.mmr OR (e.mmr=me.mmr AND e."ratedWins">me."ratedWins") OR (e.mmr=me.mmr AND e."ratedWins"=me."ratedWins" AND e.ratio>me.ratio) OR (e.mmr=me.mmr AND e."ratedWins"=me."ratedWins" AND e.ratio=me.ratio AND e.id<me.id)))::int AS rank FROM eligible me WHERE me.id=${id}::uuid`);
  return rows[0]?.rank??null;
 }
 return {
  async leaderboard(id:string,page=1,limit=25){return db.$transaction(async tx=>{
   const rows=await tx.$queryRaw<Row[]>(Prisma.sql`${eligible} ORDER BY mmr DESC, "ratedWins" DESC, ratio DESC, id ASC LIMIT ${limit} OFFSET ${(page-1)*limit}`);
   const total=await tx.playerStatistics.count({where:{ratedMatches:{gt:0}}});
   return {page,limit,total,totalPages:Math.ceil(total/limit),ownRank:await rank(tx,id),players:rows.map((r,i)=>({...present(r),rank:(page-1)*limit+i+1}))};
  },{isolationLevel:'RepeatableRead'});},
  async summary(id:string){return db.$transaction(async tx=>{
   const p=await tx.playerProfile.findUniqueOrThrow({where:{id},include:{statistics:true}});
   const s=p.statistics;
   const recent=await tx.matchParticipant.findMany({where:{playerProfileId:id,match:{status:'FINISHED',roomType:'MATCHMAKING',endReason:'TIME_LIMIT'}},orderBy:[{match:{endedAt:'desc'}},{matchId:'desc'}],take:5,select:{isWinner:true,matchId:true,match:{select:{endedAt:true,winnerPlayerProfileId:true}}}});
   return {playerProfileId:id,displayName:p.displayName,mmr:p.rating,division:division(p.rating),peakMmr:s?.peakMmr??Math.max(1000,p.rating),ratedMatches:s?.ratedMatches??0,wins:s?.ratedWins??0,losses:s?.ratedLosses??0,ties:s?.ratedTies??0,eliminations:s?.ratedEliminations??0,deaths:s?.ratedDeaths??0,winRate:winRate(s?.ratedWins??0,s?.ratedMatches??0),kd:kd(s?.ratedEliminations??0,s?.ratedDeaths??0),currentWinStreak:s?.currentWinStreak??0,bestWinStreak:s?.bestWinStreak??0,totalMatches:s?.totalMatches??0,unratedMatches:s?.unratedMatches??0,overallWins:s?.wins??0,overallLosses:s?.losses??0,overallTies:s?.ties??0,overallEliminations:s?.eliminations??0,overallDeaths:s?.deaths??0,rank:await rank(tx,id),recentForm:recent.map(r=>({matchId:r.matchId,endedAt:r.match.endedAt!.toISOString(),outcome:outcome(r.isWinner,r.match.winnerPlayerProfileId===null)}))};
  },{isolationLevel:'RepeatableRead'});}
 };
}
