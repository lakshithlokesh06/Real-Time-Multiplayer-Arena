export type Visibility = "PUBLIC" | "PRIVATE";
export type RoomStatus = "WAITING" | "STARTING" | "IN_GAME" | "FINISHED" | "CLOSED";
export interface RoomPlayer {
 playerProfileId: string; username: string; displayName: string;
 ready: boolean; connected: boolean; isHost: boolean; joinedAt: string;
}
export interface RoomState {
 matchStartedAt?: string; finishedAt?: string; returnedPlayerProfileIds?: string[]; gameId?: string; id: string; code: string; name: string; visibility: Visibility; status: RoomStatus;
 hostPlayerProfileId: string; maxPlayers: number; createdAt: string; players: RoomPlayer[];
}
export interface PublicRoom {
 id: string; name: string; hostDisplayName: string; playerCount: number; maxPlayers: number; status: RoomStatus;
}
export interface CreateRoomInput { name: string; visibility: Visibility; maxPlayers: number; }
export type RoomErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "ROOM_FULL" | "ALREADY_IN_ROOM" | "NOT_MEMBER" | "NOT_HOST" | "NOT_READY" | "NOT_WAITING" | "RATE_LIMITED" | "UNAVAILABLE" | "UNAUTHENTICATED";
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: RoomErrorCode; message: string } };
export type Ack<T> = (result: Result<T>) => void;
export interface ClientToServerEvents {
 "game:sync": (payload: Record<string, never>, ack: Ack<GameSnapshot | null>) => void;
 "game:leave": (payload: Record<string, never>, ack: Ack<null>) => void;
 "game:aim": (payload: CombatIntent) => void;
 "game:fire": (payload: CombatIntent) => void;
 "game:input": (payload: GameInput) => void;
 "system:ping": () => void;
 "rooms:list": (payload: Record<string, never>, ack: Ack<PublicRoom[]>) => void;
 "room:sync": (payload: Record<string, never>, ack: Ack<RoomState | null>) => void;
 "room:create": (payload: CreateRoomInput, ack: Ack<RoomState>) => void;
 "room:join": (payload: { roomId: string }, ack: Ack<RoomState>) => void;
 "room:join-code": (payload: { code: string }, ack: Ack<RoomState>) => void;
 "room:leave": (payload: Record<string, never>, ack: Ack<null>) => void;
 "room:set-ready": (payload: { ready: boolean }, ack: Ack<RoomState>) => void;
 "room:return": (payload: Record<string, never>, ack: Ack<RoomState>) => void;
 "room:start": (payload: Record<string, never>, ack: Ack<RoomState>) => void;
}
export interface ServerToClientEvents {
 "game:state": (snapshot: GameSnapshot) => void;
 "game:error": (error: { code: RoomErrorCode; message: string }) => void;
 "system:pong": (payload: { socketId: string; timestamp: string }) => void;
 "room:state": (room: RoomState | null) => void;
 "rooms:list": (rooms: PublicRoom[]) => void;
 "room:ready-to-start": (payload: { roomId: string; message: string }) => void;
 "lobby:replaced": () => void;
}

export interface GameInput { life?: number; gameId: string; sequence: number; up: boolean; down: boolean; left: boolean; right: boolean }
export interface GamePlayer { score: number; health: number; maxHealth: number; alive: boolean; respawnInMs: number; eliminations: number; deaths: number; aimX: number; aimY: number; life: number; lastCombatSequence: number; playerProfileId: string; username: string; displayName: string; x: number; y: number; lastSequence: number; connected: boolean }
export interface GameSnapshot { match: { status: "IN_GAME" | "FINISHED"; startedAt: string; durationSeconds: number; remainingMs: number; result: MatchResult | null; persistence: "SAVING" | "SAVED" | "FAILED" }; gameId: string; roomId: string; tick: number; serverTime: number; tickRate: number; snapshotRate: number; players: GamePlayer[]; projectiles: GameProjectile[] }

export interface CombatIntent { gameId: string; life: number; sequence: number; aimX: number; aimY: number }
export interface GameProjectile { id: string; ownerPlayerProfileId: string; x: number; y: number; directionX: number; directionY: number }

export interface MatchStanding { playerProfileId: string; username: string; displayName: string; score: number; eliminations: number; deaths: number; placement: number; isWinner: boolean; leftEarly: boolean }
export interface MatchResult { matchId: string; roomId: string; roomName: string; startedAt: string; endedAt: string; durationSeconds: number; endReason: "TIME_LIMIT" | "EMPTY_ROOM"; tied: boolean; winnerPlayerProfileId: string | null; standings: MatchStanding[] }
