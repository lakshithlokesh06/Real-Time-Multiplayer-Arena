# Phase 7 verification — 2026-09-11

## Outcome and automated checks

Automated 1v1 matchmaking, queue management, acceptance, automatic room launch, Elo/MMR persistence, results/history rating display, and responsive matchmaking UI are implemented. Manual room flows remain available. No Phase 8 work was started.

Final full suite: **197 passed, 0 failed, 0 skipped** — **185 backend + 12 shared**. The 156 previous tests remain, with **41 new tests**: nine pure rating/selection tests, 23 Redis-backed matchmaking tests, five socket/security tests, and four persistence/MMR tests. The existing populated migration test was extended to cover Phase 7 and historical match compatibility.

Coverage includes:

- Rating default/expectation, equal wins/losses/ties, upsets, deterministic integer zero-sum rounding, exact range boundaries, oldest compatible ordering, and exclusion of disconnected/proposed/cooling-down candidates.
- Authoritative queue time/rating, safe identity projection, duplicate/idempotent join and cancel, manual-room exclusion, expansion, identical proposals, one/both acceptance, deadline, decline/requeue priority, pair cooldown, timeout, stale acceptance, queued/proposal refresh, reconnect grace, and assignment blocked during disconnect.
- Concurrent joins, cancellation versus selection, manual-create versus queue-join, overlapping cycles, and independent matchmaker callers sharing the owner lane. Each player appears at most once.
- Stale queue cleanup, shutdown of both Redis documents, unavailable Redis, namespace-loss safety, automatic result retention, and cancellation during STARTING.
- Real authenticated sockets, forged rating/opponent/deadline rejection, normal GameManager/Match creation, automatic hidden two-player rooms, newest-tab recovery/old-handler rejection, logout cleanup, command limiting, and blocking a second rated search after early departure, and overlapping save accounting.
- Persisted before/after/delta, atomic profile updates, concurrent/repeated finish idempotency, transaction rollback, manual-match rating exclusion, empty-room exclusion, safe history, populated profile defaults, and compatible old Match/MatchParticipant rows.

`npm run lint`, `npm run typecheck`, `npm run db:validate`, frontend production build, and server production build passed. `git diff --check` passed. No dependency or lockfile changes were needed.

During verification, explicit generic types were added to new socket test helpers. The Redis-loss guard initially changed a previous waiting-room TTL expectation; it was refined to protect namespaces holding active queue/game state while retaining the previous waiting-only TTL cleanup behavior. All previous tests pass without weakening that assertion. Review also found and fixed code-less automatic rooms surviving result retention; those rooms now release members and are deleted.

## Prisma migration and Redis verification

Applied `20260911050000_matchmaking_rating` using Prisma migrate deploy against the development database. The additive migration adds PlayerProfile.rating (1000 default), Match.roomType (MANUAL default), and nullable participant rating snapshots/deltas. It does not reset or replace existing tables. Before/after existing-field comparisons passed for User, PlayerProfile, Session, Match, and MatchParticipant (the development database had zero rows in these tables before browser fixtures).

A dedicated isolated upgrade test populates the old account/profile/session tables and historical match/participant rows, applies Phase 7, verifies all old fields unchanged, and checks rating/type/null defaults. Other integration tests deploy all three migrations into fresh random schemas of a database ending `_test`. Redis tests use random keys in database 15; no shared database flush is used.

Room and queue documents are separate namespaced keys, atomically committed with MULTI/EXEC through the same serialized owner lane. Tests verify cancellation/assignment exclusivity, no duplicate proposals, both-key shutdown cleanup, and safe behavior when one protected key disappears. A single process owns each namespace; distributed ownership is not claimed.

## Browser verification

Ran both scripts with two independently authenticated Chrome contexts and 15-second process-only match duration overrides. Final runs used production builds (`server start` and `next start`). The automatic flow was rerun after the dedicated Preparing Arena screen was added; the manual flow was unchanged by that refinement. The overlapping-save correction is covered by its socket regression and the final full test/static/build runs.

`scripts/verify-matchmaking.mjs` verifies:

1. Find Match, Searching, elapsed queue time surviving refresh, Cancel Search, and search again.
2. Both receive Match Found; first acceptance shows Waiting for opponent.
3. Opponent declines; accepted player requeues with priority; same pair waits through cooldown before receiving another offer.
4. Refresh during Match Found preserves the offer; mobile acceptance UI fits within 390 px and has textual controls/countdown.
5. Both accept, see Preparing Arena, and enter Phaser automatically without manual host input.
6. Actual keyboard movement and mouse firing; one elimination/point, victim death, authoritative time expiry, cleared gameplay, and identical saved results.
7. Equal initial ratings produce `1000 → 1016 (+16)` and `1000 → 984 (-16)` on the respective results screens.
8. Finished refresh preserves the result, both return to Find Match, and a second automatic match starts with fresh identity/full health/zero score.
9. A tied second finish, persisted history containing exact first-match rating data, exactly two completed Match rows/four participants, tablet/mobile results/history, no page overflow, and no significant console/page errors.

`scripts/verify-matches.mjs` rechecks the existing manual create/join/ready/start flow, combat, winner, finished refresh, readiness reset, new rematch, tied results, history, exact database row counts, and tablet/mobile layouts. Automated persistence tests separately verify manual matches do not change ratings.

Desktop results and mobile offer screenshots were visually inspected. Browser artifacts/logs live in temporary directories outside the repository. Each script deletes only its generated match IDs and unique fixture accounts. No actual environment files were edited; the short timer exists only on the QA server process. Browser timeout behavior is covered by deterministic service tests, not claimed as an additional browser scenario.

## Run locally

From the repository root, with Node >=22.12 and the existing environment files configured:

```sh
npm install
docker compose up -d --wait
npm run db:migrate -w server
npm run db:generate -w server
npm run dev:server
```

In a second terminal:

```sh
npm run dev:frontend
```

Open `http://localhost:3000`; the API defaults to port 4000. A fresh checkout requires configuring the existing `.env.example` templates first. No new environment variable is required for matchmaking. The existing `MATCH_DURATION_SECONDS` defaults to 180 (valid 5–3600). Matchmaking policy constants are centralized in `server/src/matchmaking/state.ts` and Elo constants in `rating.ts`.

Verification commands:

```sh
npm test
npm run lint
npm run typecheck
npm run db:validate
npm run build
git diff --check
```

Tests require `TEST_DATABASE_URL` pointing to a dedicated database ending `_test` and `TEST_REDIS_URL` ending `/15`. This machine's working Node runtime was selected with:

```sh
export PATH=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

For browser QA, after building and stopping normal servers:

```sh
MATCH_DURATION_SECONDS=15 npm run start -w server
```

In a second terminal:

```sh
npm run start -w frontend
```

In a third terminal:

```sh
export PLAYWRIGHT_MODULE=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
export ARENA_BROWSER_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node scripts/verify-matchmaking.mjs
node scripts/verify-matches.mjs
```

Playwright/Chrome are optional verification tooling, not new project dependencies. Use an available equivalent runtime on another machine. Stop QA servers afterward; normal startup restores the default 180-second timer.

## Files created and modified

Created:

- `server/src/matchmaking/state.ts`, `server/src/matchmaking/service.ts`, `server/src/matchmaking/rating.ts`
- `server/prisma/migrations/20260911050000_matchmaking_rating/migration.sql`
- `server/test/matchmaking.test.ts`, `server/test/rating.test.ts`
- `frontend/src/components/matchmaking-panel.tsx`
- `scripts/verify-matchmaking.mjs`

Modified:

- `shared/index.d.ts`, `server/prisma/schema.prisma`
- `server/src/services/rooms.ts`, `server/src/services/matches.ts`, `server/src/services/auth.ts`
- `server/src/socket/rooms.ts`, `server/src/game/manager.ts`
- `server/test/rooms.test.ts`, `server/test/match-persistence.test.ts`, `server/test/migration.test.ts`
- `frontend/src/hooks/use-lobby.ts`, `frontend/src/types/player.ts`
- `frontend/src/components/multiplayer-lobby.tsx`, `frontend/src/components/match-results.tsx`, `frontend/src/components/match-history.tsx`
- `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`
- `docs/architecture.md`, `docs/verification.md`

## Limits and Git verification

Matchmaking is single-process, capped at 200 entries, with one-second bounded candidate scans and ten-minute stale-entry expiry. There is no distributed owner/lock implementation or load-test claim. No Redis Cluster support is claimed for the two-key transaction. Rating is an initial Elo foundation without seasons/divisions/rankings. Decline/timeout and empty-room termination have no rating penalty. Players leaving an active rated game must wait for completion before another automatic search. A failed final save retains the existing bounded-retry/unfinished-record limitations; no durable retry queue or active-match recovery exists.

Redis outages reject queue/room operations while in-memory gameplay can continue. Loss of a namespace holding live queue/game state requires application restart; reconnect/room cleanup may be unavailable meanwhile. New process namespaces prevent old proposals from creating duplicate rooms; old keys expire after 120 seconds. An automatic STARTING disconnect cancels the room rather than automatically requeueing the opponent. Global leaderboards, seasons, ranked divisions, parties, teams, bots, spectators, tournaments, and deployment remain deferred. Phase 8 was not started.

Starting branch was clean `main` at `51d25bb`. Phase 7 preserved README.md exactly; its SHA-1 was and remains `45af7d2f355d2306da160aa3094a61b2514d480d`. README.md is not staged or included in this phase's commit. Only explicitly enumerated Phase 7 files are staged, excluding actual environment files, generated output, browser artifacts, and unrelated changes. The requested commit message is `Add automated matchmaking and MMR foundation`. Actual commit/push hashes and final synchronization are reported after the Git operations in the completion message; no force-push or automatic conflict resolution is used.
