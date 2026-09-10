import type { MatchResult, MatchStanding } from "@arena/shared";
export type Participant = Omit<MatchStanding, "placement" | "isWinner">;
export function standings(participants: Participant[], competitive = true): Pick<MatchResult, "standings" | "tied" | "winnerPlayerProfileId"> {
 const sorted = participants.map(p => ({ ...p })).sort((a,b) => b.score-a.score || b.eliminations-a.eliminations || a.deaths-b.deaths || (a.playerProfileId < b.playerProfileId ? -1 : a.playerProfileId > b.playerProfileId ? 1 : 0));
 const first = sorted[0];
 const rows = sorted.map((p,index) => ({ ...p, placement: index+1, isWinner: !!(competitive && first && p.score===first.score && p.eliminations===first.eliminations && p.deaths===first.deaths) }));
 const winners = rows.filter(p => p.isWinner);
 return { standings: rows, tied: winners.length > 1, winnerPlayerProfileId: winners.length === 1 ? winners[0]!.playerProfileId : null };
}
