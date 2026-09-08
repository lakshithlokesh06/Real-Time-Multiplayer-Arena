export interface ClientToServerEvents { "system:ping": () => void; }
export interface ServerToClientEvents { "system:pong": (payload: { socketId: string; timestamp: string }) => void; }
export interface SocketData {
 sessionId: string;
 userId: string;
 playerProfileId: string;
 username: string;
 displayName: string;
}
