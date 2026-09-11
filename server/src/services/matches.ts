import type { MatchResult, RoomState } from "@arena/shared";
import type { Database } from "../config/database.js";
import {elo} from "../matchmaking/rating.js";
import { HttpError } from "../utils/http-error.js";
const resultSelect = { roomType:true,id:true, roomId:true, roomName:true, startedAt:true, endedAt:true, durationSeconds:true, endReason:true, winnerPlayerProfileId:true, participants: { orderBy: { placement: "asc" as const }, select: { ratingBefore:true,ratingAfter:true,ratingDelta:true,participantKey:true,username:true,displayName:true,score:true,eliminations:true,deaths:true,placement:true,isWinner:true,leftEarly:true } } } as const;
type StoredResult = Awaited<ReturnType<Database["match"]["findMany"]>>[number];
// Explicit projection: account relations and private fields are never serialized.
function safeResult(m: Pick<StoredResult,"roomType"|"id"|"roomId"|"roomName"|"startedAt"|"endedAt"|"durationSeconds"|"endReason"|"winnerPlayerProfileId"> & {participants: {ratingBefore:number|null;ratingAfter:number|null;ratingDelta:number|null;participantKey:string;username:string;displayName:string;score:number;eliminations:number;deaths:number;placement:number|null;isWinner:boolean;leftEarly:boolean}[]}):MatchResult {
 return {...(m.roomType==="MATCHMAKING"?{roomType:"MATCHMAKING" as const}:{}),matchId:m.id,roomId:m.roomId,roomName:m.roomName,startedAt:m.startedAt.toISOString(),endedAt:m.endedAt!.toISOString(),durationSeconds:m.durationSeconds!,endReason:m.endReason as MatchResult["endReason"],winnerPlayerProfileId:m.winnerPlayerProfileId,tied:m.participants.filter(p=>p.isWinner).length>1,standings:m.participants.map(p=>({... (p.ratingBefore!==null&&p.ratingAfter!==null&&p.ratingDelta!==null?{ratingBefore:p.ratingBefore,ratingAfter:p.ratingAfter,ratingDelta:p.ratingDelta}:{}),playerProfileId:p.participantKey,username:p.username,displayName:p.displayName,score:p.score,eliminations:p.eliminations,deaths:p.deaths,placement:p.placement!,isWinner:p.isWinner,leftEarly:p.leftEarly}))};
}
export function createMatchService(db:Database, durationSeconds=180) {
 return {
  async rating(id:string){return (await db.playerProfile.findUniqueOrThrow({where:{id},select:{rating:true}})).rating;},
  async start(room:RoomState):Promise<string> {
   if (!room.gameId) throw new Error("Match identity required");
   const ratings=room.roomType==="MATCHMAKING"?await db.playerProfile.findMany({where:{id:{in:room.players.map(p=>p.playerProfileId)}},select:{id:true,rating:true}}):[];
   const match=await db.match.upsert({where:{id:room.gameId},update:{},create:{roomType:room.roomType??"MANUAL",id:room.gameId,roomId:room.id,roomName:room.name,startedAt:new Date(),durationLimitSeconds:durationSeconds,participants:{create:room.players.map(p=>({ratingBefore:ratings.find(r=>r.id===p.playerProfileId)?.rating,participantKey:p.playerProfileId,playerProfileId:p.playerProfileId,username:p.username,displayName:p.displayName}))}},select:{startedAt:true}});
   return match.startedAt.toISOString();
  },
  async finish(result:MatchResult) {
   await db.$transaction(async tx=>{
    const claimed=await tx.match.updateMany({where:{id:result.matchId,status:"IN_GAME"},data:{status:"FINISHED",endedAt:new Date(result.endedAt),durationSeconds:result.durationSeconds,endReason:result.endReason,winnerPlayerProfileId:result.winnerPlayerProfileId}});
    if (!claimed.count) { if (!await tx.match.findUnique({where:{id:result.matchId},select:{id:true}})) throw new Error("Missing match"); return; }
    const match=await tx.match.findUniqueOrThrow({where:{id:result.matchId},include:{participants:true}});
    if(match.roomType==='MATCHMAKING'&&result.endReason==='TIME_LIMIT'){
     const rows=[...match.participants].sort((a,b)=>a.participantKey<b.participantKey?-1:1);
     if(rows.length!==2||rows.some(p=>p.ratingBefore===null))throw new Error('Invalid rated participants');
     const first=result.standings.find(p=>p.playerProfileId===rows[0]!.participantKey);if(!first)throw new Error('Missing rated standing');
     const ratings=elo(rows[0]!.ratingBefore!,rows[1]!.ratingBefore!,result.tied?0.5:first.isWinner?1:0);
     for(let i=0;i<2;i++){const p=rows[i]!,after=ratings[i]!,delta=after-p.ratingBefore!;await tx.matchParticipant.update({where:{id:p.id},data:{ratingAfter:after,ratingDelta:delta}});if(p.playerProfileId)await tx.playerProfile.update({where:{id:p.playerProfileId},data:{rating:{increment:delta}}});}
    }
    const count=await tx.matchParticipant.count({where:{matchId:result.matchId}});
    if (count!==result.standings.length) throw new Error("Incomplete results");
    for(const p of result.standings) {
     const updated=await tx.matchParticipant.updateMany({where:{matchId:result.matchId,participantKey:p.playerProfileId},data:{score:p.score,eliminations:p.eliminations,deaths:p.deaths,placement:p.placement,isWinner:p.isWinner,leftEarly:p.leftEarly}});
     if (updated.count!==1) throw new Error("Missing participant");
    }
   });
   return safeResult(await db.match.findUniqueOrThrow({where:{id:result.matchId},select:resultSelect}));
  },
  async list(playerId:string,limit=10) {
   const rows=await db.match.findMany({where:{status:"FINISHED",participants:{some:{playerProfileId:playerId}}},orderBy:[{endedAt:"desc"},{id:"desc"}],take:Math.max(1,Math.min(25,limit)),select:resultSelect});
   return rows.map(safeResult);
  },
  async detail(playerId:string,id:string) {
   const row=await db.match.findFirst({where:{id,status:"FINISHED",participants:{some:{playerProfileId:playerId}}},select:resultSelect});
   if(!row)throw new HttpError(404,"Match not found.");return safeResult(row);
  },
 };
}
export type MatchService=ReturnType<typeof createMatchService>;
