import { io } from "socket.io-client";
import { clientConfig } from "@/lib/config";
export function createArenaSocket() {
 // Identity is derived from the HttpOnly cookie by the server, never supplied in auth payloads.
 return io(clientConfig.socketUrl, { withCredentials: true, autoConnect: false, reconnectionAttempts: 3 });
}
