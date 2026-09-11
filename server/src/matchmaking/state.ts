import type { MatchmakingState } from '@arena/shared';
export interface Entry { playerProfileId:string; username:string; displayName:string; rating:number; queuedAt:number; disconnectedAt?:number; proposalId?:string; }
export interface Proposal { id:string; players:[string,string]; accepted:string[]; deadline:number; }
export interface QueueStore { entries:Record<string,Entry>; proposals:Record<string,Proposal>; cooldowns:Record<string,number>; timeouts:Record<string,number>; }
export const emptyQueue=():QueueStore=>({entries:{},proposals:{},cooldowns:{},timeouts:{}});
export const POLICY={initialRange:100,rangeStep:100,expandEveryMs:10000,broadAfterMs:30000,acceptMs:10000,graceMs:5000,pairCooldownMs:15000,maxEntries:200,staleMs:600000,cycleMs:1000} as const;
export const pairKey=(a:string,b:string)=>[a,b].sort().join(':');
export function range(age:number){return age>=POLICY.broadAfterMs?Infinity:POLICY.initialRange+Math.floor(Math.max(0,age)/POLICY.expandEveryMs)*POLICY.rangeStep;}
export function candidates(store:QueueStore,now:number):[string,string][]{
 const entries=Object.values(store.entries).filter(e=>!e.proposalId&&e.disconnectedAt===undefined).sort((a,b)=>a.queuedAt-b.queuedAt||(a.playerProfileId<b.playerProfileId?-1:1));
 const used=new Set<string>(),pairs:[string,string][]=[];
 for(const a of entries){if(used.has(a.playerProfileId))continue;const b=entries.find(b=>b!==a&&!used.has(b.playerProfileId)&&(store.cooldowns[pairKey(a.playerProfileId,b.playerProfileId)]??0)<=now&&Math.abs(a.rating-b.rating)<=Math.max(range(now-a.queuedAt),range(now-b.queuedAt)));if(b){used.add(a.playerProfileId);used.add(b.playerProfileId);pairs.push([a.playerProfileId,b.playerProfileId]);}}
 return pairs;
}
export function queueView(store:QueueStore,id:string,now:number,roomId?:string):MatchmakingState{
 if(roomId)return{status:'ASSIGNED',serverTime:now,roomId};
 const e=store.entries[id];if(!e)return{status:(store.timeouts[id]??0)>now?'TIMED_OUT':'IDLE',serverTime:now};
 const p=e.proposalId?store.proposals[e.proposalId]:undefined;
 return p?{status:p.accepted.includes(id)?'ACCEPTED':'MATCH_FOUND',serverTime:now,proposalId:p.id,deadline:p.deadline,rating:e.rating,queuedAt:e.queuedAt}:{status:'QUEUED',serverTime:now,rating:e.rating,queuedAt:e.queuedAt};
}
