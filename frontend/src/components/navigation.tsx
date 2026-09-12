"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./auth-provider";
export function Navigation() {
 const { status, player, logout } = useAuth();
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 async function signOut() {
  setBusy(true); setError("");
  try { await logout(); } catch { setError("Logout failed. Please try again."); } finally { setBusy(false); }
 }
 return <header className="site-header"><Link href="/" className="brand" aria-label="Arena home"><span className="brand-mark" aria-hidden="true">A</span> ARENA<span className="brand-sub"> / MULTIPLAYER</span></Link><nav aria-label="Main navigation">{status === "authenticated" ? <><span className="nav-player">{player.profile.displayName}</span><Link href="/dashboard">Dashboard</Link><Link href="/play">Play</Link><Link href="/leaderboard">Rankings</Link><Link href="/matches">Matches</Link><Link href="/profile">Profile</Link><button onClick={() => void signOut()} disabled={busy}>{busy ? "Signing out…" : "Logout"}</button></> : status === "loading" ? <span role="status">Checking session…</span> : <><Link href="/login">Login</Link><Link href="/register" className="nav-play">Create Account ↗</Link></>}</nav>{error && <p className="form-error" role="alert">{error}</p>}</header>;
}
