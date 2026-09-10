import type { CombatIntent, GameInput, GamePlayer } from "@arena/shared";
export interface PlayerRuntime {
 state: GamePlayer;
 pending?: GameInput;
 pendingFire?: CombatIntent;
 received: number;
 nextShotTick: number;
 respawnTick: number;
 previousX: number;
 previousY: number;
}
