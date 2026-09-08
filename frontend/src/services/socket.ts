import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@arena/shared";
import { clientConfig } from "@/lib/config";
export type ArenaSocket = Socket<ServerToClientEvents,ClientToServerEvents>;
export function createArenaSocket(): ArenaSocket {
 return io(clientConfig.socketUrl, { withCredentials: true, autoConnect: false, reconnectionAttempts: 3, reconnectionDelay: 500, reconnectionDelayMax: 1500 });
}
