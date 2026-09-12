/** All competitive presentation is derived from authoritative counters. */
export function division(mmr:number) {
 const tiers=[['Bronze',0],['Silver',900],['Gold',1100],['Platinum',1300],['Diamond',1500],['Master',1700]] as const;
 const index=tiers.reduce((best,[,floor],i)=>mmr>=floor?i:best,0);
 const [name,floor]=tiers[index]!,next=tiers[index+1];
 return {name,mmr,nextDivision:next?.[0]??null,nextThreshold:next?.[1]??null,mmrRequired:next?next[1]-mmr:0,progress:next?Math.max(0,Math.min(1,(mmr-floor)/(next[1]-floor))):1};
}
export const winRate=(wins:number,matches:number)=>matches?100*wins/matches:0;
export const kd=(eliminations:number,deaths:number)=>deaths?eliminations/deaths:eliminations;
export const outcome=(winner:boolean,tied:boolean)=>winner?(tied?'T':'W'):'L';
