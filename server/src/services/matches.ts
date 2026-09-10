import type { MatchResult, RoomState } from "@arena/shared";
import type { Database } from "../config/database.js";
import { HttpError } from "../utils/http-error.js";
const resultSelect = { id:true, roomId:true, roomName:true, startedAt:true, endedAt:true, durationSeconds:true, endReason:true, winnerPlayerProfileId:true, participants: { orderBy: { placement: "asc" as const }, select: { participantKey:true,username:true,displayName:true,score:true,eliminations:true,deaths:true,placement:true,isWinner:true,leftEarly:true } } } as const;
type StoredResult = Awaited<ReturnType<Database["match"]["findMany"]>>[number];
// Explicit projection: account relations and private fields are never serialized.
function safeResult(m: Pick<StoredResult,"id"|"roomId"|"roomName"|"startedAt"|"endedAt"|"durationSeconds"|"endReason"|"winnerPlayerProfileId"> & {participants: {participantKey:string;username:string;displayName:string;score:number;eliminations:number;deaths:number;placement:number|null;isWinner:boolean;leftEarly:boolean}[]}):MatchResult {
 return {matchId:m.id,roomId:m.roomId,roomName:m.roomName,startedAt:m.startedAt.toISOString(),endedAt:m.endedAt!.toISOString(),durationSeconds:m.durationSeconds!,endReason:m.endReason as MatchResult["endReason"],winnerPlayerProfileId:m.winnerPlayerProfileId,tied:m.participants.filter(p=>p.isWinner).length>1,standings:m.participants.map(p=>({playerProfileId:p.participantKey,username:p.username,displayName:p.displayName,score:p.score,eliminations:p.eliminations,deaths:p.deaths,placement:p.placement!,isWinner:p.isWinner,leftEarly:p.leftEarly}))};
}
export function createMatchService(db:Database, durationSeconds=180) {
 return {
  async start(room:RoomState):Promise<string> {
   if (!room.gameId) throw new Error("Match identity required");
   const match=await db.match.upsert({where:{id:room.gameId},update:{},create:{id:room.gameId,roomId:room.id,roomName:room.name,startedAt:new Date(),durationLimitSeconds:durationSeconds,participants:{create:room.players.map(p=>({participantKey:p.playerProfileId,playerProfileId:p.playerProfileId,username:p.username,displayName:p.displayName}))}},select:{startedAt:true}});
   return match.startedAt.toISOString();
  },
  async finish(result:MatchResult) {
   await db.$transaction(async tx=>{
    const claimed=await tx.match.updateMany({where:{id:result.matchId,status:"IN_GAME"},data:{status:"FINISHED",endedAt:new Date(result.endedAt),durationSeconds:result.durationSeconds,endReason:result.endReason,winnerPlayerProfileId:result.winnerPlayerProfileId}});
    if (!claimed.count) { if (!await tx.match.findUnique({where:{id:result.matchId},select:{id:true}})) throw new Error("Missing match"); return; }
    const count=await tx.matchParticipant.count({where:{matchId:result.matchId}});
    if (count!==result.standings.length) throw new Error("Incomplete results");
    for(const p of result.standings) {
     const updated=await tx.matchParticipant.updateMany({where:{matchId:result.matchId,participantKey:p.playerProfileId},data:{score:p.score,eliminations:p.eliminations,deaths:p.deaths,placement:p.placement,isWinner:p.isWinner,leftEarly:p.leftEarly}});
     if (updated.count!==1) throw new Error("Missing participant");
    }
   });
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
