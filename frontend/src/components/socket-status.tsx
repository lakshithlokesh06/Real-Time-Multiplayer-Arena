"use client";
import { useEffect, useState } from "react";
import { createArenaSocket } from "@/services/socket";
import { useAuth } from "./auth-provider";
export function SocketStatus() {
 const [status, setStatus] = useState("Connecting to the arena server…");
 const { refresh } = useAuth();
 useEffect(() => {
  const socket = createArenaSocket();
  socket.on("connect", () => socket.emit("system:ping"));
  socket.on("system:pong", () => setStatus("Authenticated connection verified. Gameplay is coming later."));
  socket.on("connect_error", () => { setStatus("Connection unavailable. Please reload to retry."); void refresh(); });
  socket.on("disconnect", () => { setStatus("Disconnected from the arena server."); void refresh(); });
  socket.connect();
  return () => { socket.removeAllListeners(); socket.disconnect(); };
 }, [refresh]);
 return <p role="status" className="field-help">{status}</p>;
}
