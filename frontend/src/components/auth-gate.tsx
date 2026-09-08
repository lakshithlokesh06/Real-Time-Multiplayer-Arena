"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
export function AuthGate({ children, guest = false }: { children: React.ReactNode; guest?: boolean }) {
 const { status, refresh } = useAuth();
 const router = useRouter();
 const redirect = guest ? status === "authenticated" : status === "unauthenticated";
 useEffect(() => { if (redirect) router.replace(guest ? "/dashboard" : "/login"); }, [redirect, guest, router]);
 if (status === "error") return <main id="main" className="placeholder"><h1>Connection interrupted.</h1><p>We could not check your session. Please try again.</p><button className="button secondary" onClick={() => void refresh()}>Retry</button></main>;
 if (status === "loading" || redirect) return <main id="main" className="placeholder"><p role="status">Checking your session…</p></main>;
 return children;
}
