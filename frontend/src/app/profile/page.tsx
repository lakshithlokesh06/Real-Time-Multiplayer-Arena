import { AuthGate } from "@/components/auth-gate";
import { PlayerProfile } from "@/components/player-profile";
export const metadata = { title: "Profile" };
export default function Profile() { return <AuthGate><PlayerProfile /></AuthGate>; }
