export interface Player {
 id: string;
 email: string;
 createdAt: string;
 profile: { id: string; username: string; displayName: string };
}
export interface Registration { email: string; username: string; displayName: string; password: string; }
