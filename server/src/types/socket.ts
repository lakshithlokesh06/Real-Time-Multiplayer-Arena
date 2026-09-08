export type { ClientToServerEvents, ServerToClientEvents } from "@arena/shared";
export interface SocketData {
 sessionId: string;
 userId: string;
 playerProfileId: string;
 username: string;
 displayName: string;
}
