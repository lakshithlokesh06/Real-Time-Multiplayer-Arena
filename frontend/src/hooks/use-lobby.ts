"use client";
import { useEffect, useRef, useState } from "react";
import type { CreateRoomInput, PublicRoom, RoomState, Result } from "@arena/shared";
import { createArenaSocket, type ArenaSocket } from "@/services/socket";
import { useAuth } from "@/components/auth-provider";
export function useLobby() {
 const { player, refresh } = useAuth();
 const playerId = player?.id;
 const socketRef = useRef<ArenaSocket | null>(null);
 const [connection, setConnection] = useState("Connecting");
 const [room, setRoom] = useState<RoomState | null>(null);
 const [rooms, setRooms] = useState<PublicRoom[]>([]);
 const [error, setError] = useState("");
 const [notice, setNotice] = useState("");
 const [busy, setBusy] = useState(false);
 useEffect(() => {
  if (!playerId) return;
  const socket = createArenaSocket(); socketRef.current = socket;
  socket.on("connect", () => {
   setConnection("Connected"); setError("");
   socket.timeout(5000).emit("room:sync",{},(timeout,result) => {
    if (socketRef.current !== socket || !socket.connected) return;
    if (timeout) setError("The lobby did not respond. Please retry.");
    else if (result.ok) setRoom(result.data);
    else setError(result.error.message);
   });
  });
  socket.on("room:state",state => { setRoom(state); if (!state) setNotice(""); });
  socket.on("rooms:list",setRooms);
  socket.on("room:ready-to-start",event => setNotice(event.message));
  socket.on("lobby:replaced",() => { setConnection("Opened in another tab"); setError("This player's lobby is now controlled from another tab. Reconnect here to take over."); });
  socket.on("disconnect",reason => { setConnection(current => current === "Opened in another tab" ? current : "Disconnected"); setRoom(null); setRooms([]); setBusy(false); if (reason === "io server disconnect") void refresh(); });
  socket.on("connect_error",() => { setConnection("Disconnected"); setError("Cannot connect to the lobby. Please retry."); void refresh(); });
  socket.connect();
  return () => { socketRef.current = null; socket.removeAllListeners(); socket.disconnect(); };
 }, [playerId, refresh]); // Player ID alone owns the connection; display-name changes do not create a second socket.
 async function run<T>(send: (socket: ArenaSocket) => Promise<Result<T>>) {
  const socket = socketRef.current;
  if (!socket?.connected) { setError("Reconnect before sending a room command."); return; }
  setBusy(true); setError("");
  try {
   const result = await send(socket);
   if (socketRef.current !== socket || !socket.connected) return;
   if (!result.ok) setError(result.error.message);
  } catch { if (socketRef.current === socket) setError("The command timed out. Reconnect to check the current room before retrying."); }
  finally { if (socketRef.current === socket) setBusy(false); }
 }
 return {
  connection, room, rooms, error, notice, busy,
  reconnect: () => { setError(""); setConnection("Connecting"); socketRef.current?.connect(); },
  create: (input: CreateRoomInput) => run(socket => socket.timeout(5000).emitWithAck("room:create",input)),
  join: (roomId: string) => run(socket => socket.timeout(5000).emitWithAck("room:join",{roomId})),
  joinCode: (code: string) => run(socket => socket.timeout(5000).emitWithAck("room:join-code",{code})),
  leave: () => run(socket => socket.timeout(5000).emitWithAck("room:leave",{})),
  ready: (ready: boolean) => run(socket => socket.timeout(5000).emitWithAck("room:set-ready",{ready})),
  start: () => run(socket => socket.timeout(5000).emitWithAck("room:start",{})),
  refreshRooms: () => run(socket => socket.timeout(5000).emitWithAck("rooms:list",{})),
 };
}
