import { api } from "./api";
import type { Player, Registration } from "@/types/player";
type PlayerResponse = { player: Player };
export const authApi = {
 me: () => api<PlayerResponse>("/api/auth/me"),
 login: (email: string, password: string) => api<PlayerResponse>("/api/auth/login", { method: "POST", body: { email, password } }),
 register: (data: Registration) => api<PlayerResponse>("/api/auth/register", { method: "POST", body: data }),
 logout: () => api<void>("/api/auth/logout", { method: "POST", body: {} }),
 updateProfile: (displayName: string) => api<PlayerResponse>("/api/profile", { method: "PATCH", body: { displayName } }),
};
