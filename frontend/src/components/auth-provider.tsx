"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { authApi } from "@/services/auth";
import { ApiError } from "@/services/api";
import type { Player, Registration } from "@/types/player";
type AuthState = { status: "loading" | "unauthenticated" | "error"; player: null } | { status: "authenticated"; player: Player };
type AuthContextValue = AuthState & { refresh: () => Promise<void>; login: (email: string, password: string) => Promise<void>; register: (data: Registration) => Promise<void>; logout: () => Promise<void>; updateProfile: (name: string) => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
 const [state, setState] = useState<AuthState>({ status: "loading", player: null });
 const generation = useRef(0);
 const mutating = useRef(false);
 const refresh = useCallback(async () => {
  if (mutating.current) return;
  const version = ++generation.current;
  try { const { player } = await authApi.me(); if (version === generation.current) setState({ status: "authenticated", player }); }
  catch (error) { if (version === generation.current) setState({ status: error instanceof ApiError && error.status === 401 ? "unauthenticated" : "error", player: null }); }
 }, []);
 useEffect(() => {
  // Session restoration sets state only after the asynchronous HTTP request settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void refresh();
  const requestGeneration = generation;
  const unauthorized = () => { generation.current++; setState({ status: "unauthenticated", player: null }); };
  const onFocus = () => { void refresh(); };
  window.addEventListener("focus", onFocus);
  window.addEventListener("arena:unauthorized", unauthorized);
  // Only a notification is broadcast; credentials and account data never enter browser storage.
  const channel = new BroadcastChannel("arena-auth");
  channel.onmessage = onFocus;
  return () => { requestGeneration.current++; channel.close(); window.removeEventListener("focus", onFocus); window.removeEventListener("arena:unauthorized", unauthorized); };
 }, [refresh]);
 async function mutate(action: () => Promise<{ player: Player } | void>) {
  mutating.current = true;
  generation.current++;
  try {
   const result = await action();
   setState(result ? { status: "authenticated", player: result.player } : { status: "unauthenticated", player: null });
   const channel = new BroadcastChannel("arena-auth"); channel.postMessage("changed"); channel.close();
  } finally { mutating.current = false; }
 }
 return <AuthContext.Provider value={{ ...state, refresh, login: (email,password) => mutate(() => authApi.login(email,password)), register: data => mutate(() => authApi.register(data)), logout: () => mutate(authApi.logout), updateProfile: name => mutate(() => authApi.updateProfile(name)) }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider is missing"); return value; }
