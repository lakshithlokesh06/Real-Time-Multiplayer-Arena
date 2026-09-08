import { AuthGate } from "@/components/auth-gate";
import { MultiplayerLobby } from "@/components/multiplayer-lobby";
export const metadata = { title: "Multiplayer lobby" };
export default function Play() { return <AuthGate><MultiplayerLobby /></AuthGate>; }
