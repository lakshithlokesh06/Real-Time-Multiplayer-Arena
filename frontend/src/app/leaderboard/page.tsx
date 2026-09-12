import {AuthGate} from '@/components/auth-gate';
import {RankedLeaderboard} from '@/components/ranked-leaderboard';
export const metadata={title:'Ranked Leaderboard'};
export default function Page(){return <AuthGate><RankedLeaderboard/></AuthGate>;}
