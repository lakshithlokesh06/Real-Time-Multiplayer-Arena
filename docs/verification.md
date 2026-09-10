# Phase 5 verification — authoritative combat

Verified locally on 2026-09-10. README.md was not edited; its before/after SHA-1 is `b582b020f1eedcfe48b71f9742e978a66efd5874`. No commit, push, deployment, durable combat statistics, or Phase 6 work was performed.

## Exact automated results

| Check | Result |
| --- | --- |
| PostgreSQL 17 / Redis 7 | Docker Desktop started; both existing Compose services running |
| Migration deployment | Existing migration present; no pending migrations |
| Prisma validation | Passed |
| Backend tests | **114 passed, 0 failed, 0 skipped**, 12,920.881541 ms |
| Shared network/combat algorithms | **12 passed, 0 failed, 0 skipped**, 32.987167 ms |
| Total | **126 passed** |
| Frontend lint | Passed |
| Server lint | Passed |
| Frontend TypeScript | Passed |
| Server TypeScript | Passed |
| Frontend production build | Passed; Next.js generated all 10 pages |
| Server production build | Passed |
| Diff/whitespace check | Passed |

All 86 Phase 4 tests remain. The prior safe-player projection test's explicit field allowlist was extended for the new safe combat fields; no existing case was removed or skipped. New coverage is 27 deterministic combat tests, seven authenticated socket integration tests, and six shared rendering/reconciliation tests.

### Coverage

The deterministic combat tests cover valid server-generated shots; UUID/muzzle/speed/damage/lifetime ownership; aim normalization; malformed, nonfinite, zero, excessive and forged fields; nonmember/wrong-game access; dead/disconnected control; exact cooldown boundary; spam and stale sequences; fixed-step movement; lifetime expiry; world exit; swept tunneling; moving-target crossings; muzzle-overlap hits; owner immunity; nearest non-piercing hits; four-hit elimination; health clamping; duplicate elimination prevention; dead control clearing; exact respawn deadline; full health/control restoration; old-life input rejection; deterministic farthest spawn selection; grace damageability; queued-fire freeze; reconnect preservation of death state/deadline; owned-projectile leave cleanup; safe snapshot copies; and bounded combat in multiple game instances without storage dependencies.

Socket tests use real authenticated connections and isolated PostgreSQL/Redis fixtures. They additionally verify unauthenticated combat handshake rejection, wrong-game/forged damage rejection, outsider/expired-session rejection, actual projectile and health synchronization, refresh with reduced health, event flood limits, an old registered server handler after tab replacement, and leave/projectile cleanup. Existing room/transport/logout/host-transfer tests remain passing.

The six added pure shared cases cover projectile visual advancement and endpoint clamping, segment geometry edge cases, dead prediction clearing, old-life pending-input removal, and snapping remote interpolation across respawn instead of sweeping across the map. They exercise the production functions shared with the frontend.

Cooldown, lifetime, collision and respawn tests use explicit simulation ticks; none depend on sleeping to reach a combat deadline. Database/socket tests require TEST_DATABASE_URL ending in `_test` and TEST_REDIS_URL database `/15`, use randomly generated schemas/keys, and never FLUSHDB or delete unrelated accounts. The one loop has no database or Redis dependency per projectile/tick. This is a structural/unit verification, not a production load benchmark.

## Browser verification

The repeatable `scripts/verify-combat.mjs` uses two isolated authenticated Chrome contexts and disposable accounts. It verifies create/join/ready/start, mouse aim, a quick click, authoritative projectile arrival on the other client, 25-point damage, repeated-hit elimination, health/counters, dead movement/fire suppression, visible respawn countdown, refresh while damaged, refresh while dead without resetting the countdown, full-health respawn, resumed movement/fire, and live eliminations/deaths. It also checks observed shot spacing against cooldown, no self-damage, React debug-button click isolation, leaving while an owned projectile is active, player/projectile removal, and tablet/mobile HUD overflow. Expected unauthenticated 401s during initial session lookup are excluded from significant console-error assertions; page errors are always asserted absent.

The final combat scenario passed with 134 snapshots collected in each context, observed shot ticks [44,94,102,108,114], no arena error alert on elimination, and no page errors or significant console errors. The alert check is scoped to the arena so Next.js’s separate route-announcement element is not treated as a gameplay error. Screenshots of the eliminated state and the mobile HUD were visually reviewed. The original `scripts/verify-arena.mjs` was rerun and passed: 143/145 snapshots, cardinal speed 260 and diagonal speed approximately 260.00000000000045 units/second, bounded movement, refresh position recovery, canvas lifecycle, responsive layout, and zero page/significant console errors.

Browser work found and corrected two issues before final verification:

- A quick click could start and end between Phaser frames without producing a shot. The initial shot now dispatches on canvas pointer-down; held repeat remains cooldown-controlled.
- Legitimate in-flight movement could arrive just after elimination and display a misleading control error. Dead/old-life packets now have no gameplay effect and produce no expected-lifecycle error. Real authorization/validation errors remain visible. The combat browser script asserts no alert on the eliminated player's HUD.

Both scripts create only uniquely named local test accounts and delete those exact accounts on completion/failure. They save screenshots in a temporary directory printed with their result. They read public socket snapshots and rendered UI, with no mutable debug authority exposed on `window`. Browser targeting uses the bounded camera transform; actual damage, health, projectiles and counters come from server snapshots. This is local Chrome verification, not a hostile-network, WAN-latency, mobile-touch gameplay, or production benchmark.

## Behavior and limitations

Basic Blaster: 100 maximum health, 25 damage, 800 units/second projectile speed, radius 5, 300 ms cooldown, 2,000 ms lifetime, 3,000 ms respawn, and a bounded 26-unit muzzle offset. These defaults are centralized in `COMBAT`; the existing arena remains 1600×900 with 20 Hz simulation and 10 Hz snapshots. There is no ammunition, reload, or spawn protection.

The server owns projectile IDs/positions/velocity/damage, swept collisions, health, elimination and respawn. Intents contain only game/life identity, monotonic sequence, and bounded aim direction. Movement carries the current life generation too. Initial-life packets may omit life for the preserved Phase 4 contract; post-respawn control requires the new generation. Stale, duplicate, unauthorized and excessive inputs cannot grant extra shots or control other players.

Swept segment-vs-circle collision uses relative target motion and chooses one nearest living target. A short muzzle sweep also handles overlapping opponents. Own shots cannot hit their owner; already-dead targets cannot be re-eliminated. Fired shots survive the shooter's death or temporary disconnect, but explicit leave/grace expiry removes owned projectiles. Disconnected players remain frozen and damageable during the five-second grace. Refresh restores health, position, alive/dead state, countdown, cooldown and live counters. Respawn uses the farthest of nine safe fixed candidates and clears old control. No persistent statistics are written.

Frontend projectiles are visually advanced for at most 100 ms between authoritative snapshots, then held if snapshots stop. Very brief close-range shots may occur entirely between snapshots and be represented by health/hit flash rather than a visible travelling bolt. Movement prediction remains active while firing; death clears it and respawn changes its generation. Combat hit prediction and lag compensation are deferred. The HUD gives textual health and respawn state; mobile/tablet layout works, but gameplay still requires mouse and keyboard.

No final win condition, permanent score, match history, leaderboard, matchmaking, spectators, bots, player-player collision, obstacles, or production deployment was implemented. Combat state is lost on server restart. Existing Redis outage/reconnect and single-server boundaries remain; see architecture.md. The previously documented Prisma tooling dependency findings remain a known baseline; no dependency upgrade or fresh audit is claimed in this phase.

## Local commands

From the repository root, with the existing environment files configured:

```sh
docker compose up -d
npm run db:migrate -w server
npm run db:validate
npm run dev:server
```

In a second terminal:

```sh
npm run dev:frontend
```

For a fresh checkout, install with `npm ci` and prepare `.env`, `server/.env`, and `frontend/.env.local` from the examples using matching local credentials. Do not overwrite existing environment files. The project requires Node ≥22.12; Node 24 was used.

Exact verification commands:

```sh
docker compose up -d --pull never
npm run db:migrate -w server
npm run db:validate
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
git diff --exit-code -- README.md
shasum README.md
```

The existing Homebrew Node installation on this machine has a missing shared library. Commands used this working runtime:

```sh
export PATH=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

The browser commands used the available Playwright runtime and Chrome:

```sh
export PLAYWRIGHT_MODULE=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
export ARENA_BROWSER_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node scripts/verify-combat.mjs
node scripts/verify-arena.mjs
```

Playwright is optional verification tooling, not a new application dependency. On another machine supply a Playwright module or make `playwright` resolvable, and optionally choose a Chrome executable. Do not run Prisma generation/builds during a live browser match: the existing server development watcher restarts on generated-file changes.

## Files changed

Created:

- `server/src/game/combat.ts`, `server/src/game/player.ts`
- `server/test/combat.test.ts`
- `frontend/src/game/input.ts`
- `frontend/src/game/rendering/players.ts`, `frontend/src/game/rendering/projectiles.ts`
- `shared/test/combat.test.js`
- `scripts/verify-combat.mjs`

Modified:

- `server/src/game/manager.ts`, `server/src/socket/rooms.ts`
- `server/test/game.test.ts`, `server/test/rooms.test.ts`
- `shared/index.d.ts`, `shared/game.js`, `shared/game.d.ts`, `shared/test/network.test.js`
- `frontend/src/game/network.ts`, `frontend/src/game/scenes/arena-scene.ts`
- `frontend/src/components/arena-hud.tsx`, `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`
- `docs/architecture.md`, this verification record

README.md is unchanged. No database schema/migration or dependency changes were needed.
