import {randomUUID} from 'node:crypto';
import type {MatchmakingState} from '@arena/shared';
import {RoomError,type RoomService,type RoomIdentity,type LobbySnapshot} from '../services/rooms.js';
import {POLICY,candidates,pairKey,queueView,emptyQueue,type QueueStore,type Proposal} from './state.js';
import {logger} from '../utils/logger.js';
export function createMatchmakingService(rooms:RoomService,rating:(id:string)=>Promise<number>,options:{now?:()=>number;intervalMs?:number}={}){
 const now=options.now??Date.now;let running=false,closed=false;
 function queue(state:LobbySnapshot){return state.matchmaking??(state.matchmaking=emptyQueue());}
 function view(state:LobbySnapshot,id:string){const room=state.rooms[state.playerRooms[id]??''];return queueView(queue(state),id,now(),room?.roomType==='MATCHMAKING'?room.id:undefined);}
 function cancelProposal(q:QueueStore,p:Proposal,removed?:string,timedOut=false){
  q.cooldowns[pairKey(...p.players)]=now()+POLICY.pairCooldownMs;
  for(const id of p.players){const e=q.entries[id];if(!e)continue;if(id!==removed&&p.accepted.includes(id)&&e.disconnectedAt===undefined){delete e.proposalId;}else {delete q.entries[id];if(timedOut)q.timeouts[id]=now()+60000;}}
  delete q.proposals[p.id];
 }
 function clean(state:LobbySnapshot){const q=queue(state);for(const p of Object.values(q.proposals))if(p.deadline<=now())cancelProposal(q,p,undefined,true);
  for(const e of Object.values(q.entries))if(!e.proposalId&&((e.disconnectedAt!==undefined&&now()-e.disconnectedAt>=POLICY.graceMs)||now()-e.queuedAt>=POLICY.staleMs))delete q.entries[e.playerProfileId];
  for(const [id,end]of Object.entries(q.timeouts))if(end<=now())delete q.timeouts[id];
  for(const [key,end]of Object.entries(q.cooldowns))if(end<=now())delete q.cooldowns[key];
 }
 function assign(state:LobbySnapshot,p:Proposal){const q=queue(state);const entries=p.players.map(id=>q.entries[id]!);if(entries.every(e=>e&&e.disconnectedAt===undefined)&&p.accepted.length===2){rooms.assign(state,entries);for(const id of p.players)delete q.entries[id];delete q.proposals[p.id];}}
 async function cycle(){if(closed||running)return;running=true;try{await rooms.transact(state=>{clean(state);const q=queue(state);for(const p of Object.values(q.proposals))assign(state,p);for(const players of candidates(q,now())){const id=randomUUID();q.proposals[id]={id,players,accepted:[],deadline:now()+POLICY.acceptMs};for(const player of players)q.entries[player]!.proposalId=id;}return{result:null};});}finally{running=false;}}
 const interval=options.intervalMs===0?undefined:setInterval(()=>{void cycle().catch(()=>logger.warn('matchmaking.cycle_failed'));},options.intervalMs??POLICY.cycleMs).unref();
 return{
  cycle,view,
  async join(identity:RoomIdentity,guard?:()=>boolean){const mmr=await rating(identity.playerProfileId);return rooms.transact(state=>{clean(state);const id=identity.playerProfileId,q=queue(state);if(state.playerRooms[id])throw new RoomError('ALREADY_IN_ROOM','Leave your room before finding a match.');delete q.timeouts[id];if(!q.entries[id]){if(Object.keys(q.entries).length>=POLICY.maxEntries)throw new RoomError('UNAVAILABLE','Matchmaking is at capacity.');q.entries[id]={playerProfileId:id,username:identity.username,displayName:identity.displayName,rating:mmr,queuedAt:now()};}return{result:view(state,id)};},guard);},
  sync(id:string,guard?:()=>boolean){return rooms.transact(state=>{clean(state);return{result:view(state,id)};},guard);},
  cancel(id:string,guard?:()=>boolean){return rooms.transact(state=>{const q=queue(state),entry=q.entries[id];if(entry?.proposalId&&q.proposals[entry.proposalId])cancelProposal(q,q.proposals[entry.proposalId]!,id);delete q.entries[id];delete q.timeouts[id];return{result:{status:'CANCELLED',serverTime:now()} as MatchmakingState};},guard);},
  respond(id:string,proposalId:string,accept:boolean,guard?:()=>boolean){return rooms.transact(state=>{clean(state);const q=queue(state),p=q.proposals[proposalId];if(!p||!p.players.includes(id))throw new RoomError('NOT_FOUND','This match offer has expired. Search again.');if(!accept){cancelProposal(q,p,id);return{result:{status:'IDLE',serverTime:now()} as MatchmakingState};}if(q.entries[id]?.disconnectedAt!==undefined)throw new RoomError('UNAUTHENTICATED','Reconnect before accepting.');if(!p.accepted.includes(id))p.accepted.push(id);assign(state,p);return{result:view(state,id)};},guard);},
  connection(id:string,connected:boolean,guard?:()=>boolean){return rooms.transact(state=>{clean(state);const e=queue(state).entries[id];if(e){if(connected)delete e.disconnectedAt;else e.disconnectedAt=now();}return{result:view(state,id)};},guard);},
  close(){closed=true;clearInterval(interval);},
 };
}
export type MatchmakingService=ReturnType<typeof createMatchmakingService>;
