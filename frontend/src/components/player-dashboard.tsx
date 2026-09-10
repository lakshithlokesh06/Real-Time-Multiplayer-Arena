"use client";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { MatchHistory } from "./match-history";
export function PlayerDashboard() {
 const { player } = useAuth();
 if (!player) return null;
 return <main id="main" className="player-page"><p className="eyebrow">PLAYER DASHBOARD</p><h1>Welcome, {player.profile.displayName}.</h1><p className="player-handle">@{player.profile.username} <span className="pill">Signed in</span></p><section className="identity-card" aria-label="Account information"><dl><div><dt>Email</dt><dd>{player.email}</dd></div><div><dt>Joined</dt><dd>{new Date(player.createdAt).toLocaleDateString()}</dd></div><div><dt>Player ID</dt><dd>{player.profile.id}</dd></div></dl><Link href="/profile">Manage your profile ↗</Link></section><MatchHistory compact/><Link className="button primary" href="/play">Enter Arena ↗</Link><p className="field-help">Join a room, play a match, and keep your results here.</p></main>;
}
