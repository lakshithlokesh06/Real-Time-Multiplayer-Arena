import { AuthGate } from "@/components/auth-gate";
import { PlayerDashboard } from "@/components/player-dashboard";
export const metadata = { title: "Dashboard" };
export default function Dashboard() { return <AuthGate><PlayerDashboard /></AuthGate>; }
