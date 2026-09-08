export interface ClientToServerEvents { "system:ping": () => void; }
export interface ServerToClientEvents { "system:pong": (payload: { socketId: string; timestamp: string }) => void; }
