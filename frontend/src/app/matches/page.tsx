import { AuthGate } from "@/components/auth-gate";
import { MatchHistory } from "@/components/match-history";
export const metadata={title:"Match history"};
export default function Matches(){return <AuthGate><main id="main" className="player-page"><p className="eyebrow">YOUR ARENA RECORD</p><h1>Match history</h1><MatchHistory/></main></AuthGate>;}
