"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./auth-provider";
export function AuthForm({ registration = false }: { registration?: boolean }) {
 const auth = useAuth();
 const router = useRouter();
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [showPassword, setShowPassword] = useState(false);
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const email = String(data.get("email")); const password = String(data.get("password"));
  if (registration && password !== data.get("confirm")) { setError("Passwords do not match."); return; }
  setError(""); setBusy(true);
  try {
   if (registration) await auth.register({ email, password, username: String(data.get("username")), displayName: String(data.get("displayName")) });
   else await auth.login(email, password);
   router.replace("/dashboard");
  } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); }
  finally { setBusy(false); }
 }
 return <main id="main" className="account-page"><div className="account-intro"><p className="eyebrow">YOUR ARENA IDENTITY</p><h1>{registration ? "Make your mark." : "Welcome back."}</h1><p>{registration ? "Create your player identity. Your next chapter starts here." : "Sign in to your player dashboard."}</p></div><form className="account-form" onSubmit={submit} aria-busy={busy}><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />{registration && <><label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" aria-describedby="username-help" /><p id="username-help" className="field-help">3–20 letters, numbers, or underscores. Saved in lowercase.</p><label htmlFor="displayName">Display name</label><input id="displayName" name="displayName" autoComplete="nickname" required maxLength={40} /></>}<label htmlFor="password">Password</label><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={registration ? "new-password" : "current-password"} required minLength={registration ? 15 : 1} maxLength={128} aria-describedby={registration ? "password-help" : undefined} />{registration && <><p id="password-help" className="field-help">Use a unique passphrase of 15–128 characters.</p><label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={15} maxLength={128} /></>}<label className="checkbox-label"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} />Show password{registration ? "s" : ""}</label>{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button primary" disabled={busy}>{busy ? "Please wait…" : registration ? "Create account" : "Login"}</button><p className="field-help">{registration ? "Already have an account? " : "New to the arena? "}<Link href={registration ? "/login" : "/register"}>{registration ? "Login" : "Create an account"}</Link></p></form></main>;
}
