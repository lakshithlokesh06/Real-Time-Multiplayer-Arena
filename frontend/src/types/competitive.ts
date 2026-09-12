export type Division={name:string;mmr:number;nextDivision:string|null;nextThreshold:number|null;mmrRequired:number;progress:number};
export type RankedPlayer={playerProfileId:string;displayName:string;mmr:number;division:Division;ratedMatches:number;wins:number;losses:number;ties:number;eliminations:number;deaths:number;winRate:number;kd:number;rank:number|null};
export type CompetitiveSummary=RankedPlayer & {peakMmr:number;currentWinStreak:number;bestWinStreak:number;totalMatches:number;unratedMatches:number;overallEliminations:number;overallDeaths:number;recentForm:{matchId:string;endedAt:string;outcome:'W'|'L'|'T'}[]};
export type LeaderboardData={page:number;limit:number;total:number;totalPages:number;ownRank:number|null;players:(RankedPlayer & {rank:number})[]};
