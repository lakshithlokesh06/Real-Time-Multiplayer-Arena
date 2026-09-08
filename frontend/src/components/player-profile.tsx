"use client";
import { useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";
export function PlayerProfile() {
 const { player, updateProfile } = useAuth();
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [saved, setSaved] = useState(false);
 if (!player) return null;
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const name = String(new FormData(event.currentTarget).get("displayName"));
  if (!name.trim()) { setError("Enter a display name."); return; }
  setBusy(true); setError(""); setSaved(false);
  try { await updateProfile(name); setSaved(true); }
  catch(error) { setError(error instanceof Error ? error.message : "Could not save your profile."); }
  finally { setBusy(false); }
 }
 return <main id="main" className="player-page"><p className="eyebrow">PLAYER PROFILE</p><h1>Your arena identity.</h1><section className="identity-card"><dl><div><dt>Username</dt><dd>@{player.profile.username}</dd></div><div><dt>Email</dt><dd>{player.email}</dd></div><div><dt>Joined</dt><dd>{new Date(player.createdAt).toLocaleDateString()}</dd></div></dl></section><form className="account-form profile-form" onSubmit={submit} aria-busy={busy}><label htmlFor="displayName">Display name</label><input key={player.profile.displayName} id="displayName" name="displayName" defaultValue={player.profile.displayName} autoComplete="nickname" maxLength={40} required /><p className="field-help">1–40 characters. Username and email cannot be changed in this phase.</p>{error && <p role="alert" className="form-error">{error}</p>}{saved && <p role="status" className="form-success">Profile saved.</p>}<button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form></main>;
}
