# Phase 4 verification — real-time Phaser arena

Verified locally on 2026-09-08. No commit, push, deployment, or Phase 5 work was performed. **README.md was not modified**; its SHA-1 before and after is `1aa2b7686da7d9d2c8e00fea17ced77142ec65ee`.

## Automated results

| Check | Result |
| --- | --- |
| PostgreSQL 17 / Redis 7 | Existing Docker Compose services running |
| Existing migration deployment | One migration found; none pending |
| Prisma schema validation | Passed |
| Server tests | **80 passed, 0 failed, 0 skipped**, 10,764.463167 ms |
| Shared movement/network tests | **6 passed, 0 failed, 0 skipped**, 37.466458 ms |
| Total | **86 passed** |
| Frontend ESLint | Passed |
| Server ESLint | Passed |
| Frontend TypeScript | Passed |
| Server TypeScript | Passed |
| Next.js production build | Passed; all 10 pages generated |
| Server production build | Passed |
| Whitespace/diff check | Passed |

The 55 previous test cases remain: 24 account/foundation cases and 31 room cases. The superseded fake-start expectation now verifies STARTING → IN_GAME, retaining the concurrent-start/host/readiness coverage. The STARTING departure test still checks safe launch cancellation. No previous test case was removed.

New backend coverage comprises 14 deterministic simulation tests and 11 authenticated game/socket lifecycle tests. It covers eight unique safe spawns; configured speed at 10/20/60 Hz; diagonal normalization; opposing keys; all world edges; one-step coalescing; stale/duplicate sequence handling; missing-input stop; disconnect freeze; safe snapshot copies; strict input validation; wrong-game/nonmember access; preserved positions during room reconciliation; multiple instances and controlled snapshots; cleanup; bounded tick configuration; real room→game launch; malformed coordinate rejection; packet flood limiting; transport grace expiry; refresh recovery; one active tab; leave/host transfer; logout; and immediate absolute session expiry on input.

The six pure shared tests cover delayed snapshots with multiple pending inputs, authoritative correction and acknowledged-input removal, prediction boundaries/diagonals, interpolation between surrounding snapshots, endpoint clamping during missing snapshots, and immediate removal of departed players. These are the same functions used by the frontend, not duplicate test implementations.

Simulation tests use manual ticks and no database/Redis dependencies. Socket tests use real Socket.IO and isolated PostgreSQL schemas/Redis keys. They require TEST_DATABASE_URL ending in `_test` and TEST_REDIS_URL database `/15`, never fall back to production data, and never FLUSHDB. The first new controller test had an asynchronous assertion race; it was corrected to await the old socket's disconnect event. The final complete suite passes.

## Browser verification

`scripts/verify-arena.mjs` runs headless Chrome through Playwright using two isolated authenticated browser contexts and uniquely generated disposable accounts. It deletes only those generated accounts afterward. Browser tooling is optional and is not added to application dependencies. It expects the local frontend/server at ports 3000/4000 and the configured local database for cleanup.

The completed scenario verifies:

1. Register two accounts; create/join a public room; both ready; host starts.
2. Both clients render one Phaser canvas and receive the same game ID and two-player snapshots.
3. A moves and B receives the movement; B moves and A receives the movement.
4. Actual browser snapshots show cardinal and diagonal movement at 260 units/second (floating-point diagonal result approximately 260.00000000000045), with no speed gain.
5. Sustained movement reaches the top and left radius boundaries at coordinate 18. Every collected player snapshot stays inside all four bounds; deterministic tests additionally reach all four edges.
6. Refresh restores the same game ID and non-spawn authoritative position, with exactly one recreated canvas. The other player's canvas remains active.
7. Host leaves; remaining player receives a one-player snapshot. Both eventually leave and their canvases are destroyed.
8. Tablet 768×1024 and mobile 390×844 have no horizontal document overflow. Screenshots are saved for inspection.
9. No page errors or significant console errors. Expected unauthenticated 401s during initial session lookup are excluded from console-error assertions.

An initial attempt was blocked by the previously running Next.js process becoming unresponsive; direct HTTP checks also timed out. Restarting that scoped development process resolved it. The complete scenario then passed. Visual review prompted keeping player labels at readable screen size on small viewports and preventing arrow-key page scroll while the arena is focused. The final saved-script run passed with 143/145 collected snapshots, captured a two-player screenshot, and exercised ArrowLeft as well as WASD. Final two-player and mobile screenshots were visually reviewed; both players render clearly and small-screen labels remain readable.

Debug information is off by default. The browser check enables it explicitly; it contains only safe gameplay data. No internal mutable game/debug API is exposed on `window`. Browser assertions inspect actual socket snapshots and rendered UI; deterministic shared tests verify interpolation/reconciliation math. This is local verification, not an internet-latency or load benchmark.

## Commands

Run from the repository root. Existing `.env`, `server/.env`, and `frontend/.env.local` files are already configured locally. For a fresh clone, prepare them from their examples and use matching local database credentials; do not overwrite existing environment files. Use Node 24 (minimum project requirement 22.12).

```sh
npm ci
docker compose up -d
npm run db:migrate -w server
npm run db:validate
npm run dev:server
```

In a second terminal:

```sh
npm run dev:frontend
```

Verification commands used:

```sh
docker compose up -d --pull never
npm run db:migrate -w server
npm run db:validate
npm test
npm run test -w shared
npm run lint
npm run typecheck
npm run build
git diff --check
shasum README.md
```

On this machine the Homebrew Node installation has a missing shared library. The working bundled runtime was selected with:

```sh
export PATH=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

The repeatable browser command on this machine is:

```sh
export PLAYWRIGHT_MODULE=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
export ARENA_BROWSER_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node scripts/verify-arena.mjs
```

On another machine, supply a Playwright module via PLAYWRIGHT_MODULE or make `playwright` resolvable, and optionally select a Chrome executable with ARENA_BROWSER_EXECUTABLE_PATH. The script prints its temporary screenshot directory. Avoid running Prisma generation/builds during a live match test: the server's existing development watcher restarts when generated files change.

## Behavior and limits

WAITING → STARTING (two seconds) → IN_GAME replaces the old fake reset. Departing/disconnecting during STARTING cancels launch. No automatic completion exists. The in-memory GameManager owns one monotonic fixed-step loop across all instances: default 20 Hz simulation, 10 Hz snapshots. Redis holds only room metadata/membership/game ID; PostgreSQL holds identity/sessions. Neither receives per-tick position writes.

The world is 1600×900, player radius 18, speed 260, with distinct ring spawns. Input is strict boolean intent plus sequence/game ID. Server membership, newest-controller ownership, session expiry, monotonic sequences, rate limiting, normalization, and clamping bound client influence. Local prediction replays unacknowledged fixed steps after canonical correction; remote snapshots interpolate 120 ms behind. Packet loss/coalescing can cause visible corrections, and prediction stops after one second without snapshots or ten pending inputs.

Leave removes room/game membership and transfers metadata host. Server authority survives host departure. Transport loss freezes immediately and reserves membership for five seconds; refresh/reconnect restores the same position and game ID. Grace expiry removes the player. Last departure cleans up the room and instance. Restart intentionally loses live matches. Redis outages can block room/sync/leave operations even while existing in-memory simulation runs; durable recovery and multiple authoritative servers are deferred.

Mobile/tablet layout is supported, but movement requires a physical keyboard; touch controls are absent. No production/load/hostile-network benchmark was performed. Camera and local correction smoothing are basic. Combat, weapons, projectiles, health, respawning, obstacles, player collision, match results, persistent statistics, matchmaking, leaderboards, spectators, and bots are intentionally deferred.

The previously recorded four high Prisma-tooling dependency findings (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`) remain a known baseline limitation. No dependency upgrades, forced downgrade, or unvalidated override were made in Phase 4; no fresh audit is claimed here.

## Source changes

Created:

- `server/src/game/manager.ts`
- `server/test/game.test.ts`
- `shared/game.js`, `shared/game.d.ts`, `shared/test/network.test.js`
- `frontend/src/game/network.ts`, `frontend/src/game/scenes/arena-scene.ts`
- `frontend/src/components/arena-hud.tsx`
- `scripts/verify-arena.mjs`

Modified:

- `server/src/config/env.ts`, `server/.env.example`
- `server/src/services/rooms.ts`, `server/src/socket/rooms.ts`, `server/src/socket/index.ts`, `server/src/types/socket.ts`
- `server/test/rooms.test.ts`
- `shared/index.d.ts`, `shared/package.json`, root `package.json`
- `frontend/src/game/create-game.ts`, `frontend/src/game/game-canvas.tsx`
- `frontend/src/components/game-loader.tsx`, `frontend/src/components/multiplayer-lobby.tsx`
- `frontend/src/hooks/use-lobby.ts`, `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`
- `docs/architecture.md`, this verification record

Removed the now-unused placeholder `frontend/src/game/scenes/boot-scene.ts`. README.md remains byte-for-byte unchanged.
