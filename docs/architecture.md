# Architecture

Phase 5 extends the existing npm workspace monorepo. React/Next.js handles account UI; Express handles REST; Socket.IO shares the Node HTTP server; Prisma/PostgreSQL owns player identity and sessions. Redis owns ephemeral rooms; it remains optional for authentication. Authoritative movement and combat run in server memory. Matchmaking, persistent statistics, leaderboards, and match completion remain deferred.

## Frontend boundaries

Next.js App Router serves public `/`, `/login`, `/register`, and the future `/leaderboard` placeholder. `/dashboard`, `/profile`, and `/play` use a client authentication gate. They render loading UI until `/api/auth/me` resolves and redirect unauthenticated visitors to `/login`. Already signed-in users on login/register go to the dashboard. These gates are user-experience boundaries, not the security boundary: all private REST data and sockets are authorized on the server. Static route HTML contains no player data.

`AuthProvider` restores a session, exposes loading/authenticated/unauthenticated/error states, and updates identity after registration, login, profile updates, or logout. Request generations prevent a slow initial `/me` response from overwriting a newer login/logout. Focus refresh and a BroadcastChannel notification synchronize tabs without putting credentials or account data in browser storage. A failed session check displays a retry state rather than pretending the user logged out.

`services/api.ts` centralizes fetch, credentials, safe errors, JSON, and the CSRF header. `services/auth.ts` owns account endpoints. `services/socket.ts` sets `withCredentials: true`; it supplies no client identity as proof of authentication. `/play` now uses one `useLobby` hook owning one credentialed typed socket. It renders room discovery or the authoritative current-room view, clears stale UI on disconnect, synchronizes state after connect, and cleans up all listeners. A second tab replaces the previous controller. IN_GAME rooms mount one dynamically imported Phaser arena; lobby and account pages do not initialize Phaser.

## PostgreSQL model

- **User:** UUID ID, unique normalized email, Argon2id password hash, creation/update timestamps.
- **PlayerProfile:** UUID ID, unique User relation, unique lowercase username, display name, timestamps. Deleting User cascades its profile.
- **Session:** UUID ID, User relation, unique SHA-256 token hash, absolute expiry, creation timestamp. Indexes on userId and expiresAt support lookup/cleanup; deleting User cascades sessions.

`20260908050000_player_accounts` is the initial schema migration. Database constraints handle duplicate races. Registration creates User, PlayerProfile, and the first Session in one transaction; a conflicting email/username rolls back all records. Prisma 7 uses its generated TypeScript client plus the PostgreSQL driver adapter. Database configuration remains centralized in `src/config/database.ts`; the datasource URL for CLI commands stays in `prisma.config.ts`.

Future durable records include match results, player statistics, and progression. Those models do not exist yet.

## Passwords and validation

Passwords use the established `argon2` library with Argon2id, memoryCost 19456 KiB, timeCost 2, parallelism 1, and a library-generated random salt. Registration accepts 15–128 characters without arbitrary composition rules. Passwords are never trimmed or silently truncated. Login for an unknown email still verifies against a dummy Argon2 hash to reduce timing-based enumeration. Bad credentials have the same status/message whether the account exists or not.

Zod strict schemas validate untrusted JSON. Emails are trimmed/lowercased consistently; usernames are trimmed/lowercased and restricted to `[a-z0-9_]{3,20}`. Display names are trimmed, 1–40 characters, and cannot contain control/format characters or angle brackets. Only display name is editable. React renders names as text; no user-controlled HTML is inserted. Unknown fields are rejected, preventing mass assignment. Duplicate registration returns one generic conflict message for email and username.

These choices follow [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). There is no email verification, password recovery, MFA, or OAuth in this phase.

## Session lifecycle

Successful registration/login issues 32 cryptographically random bytes encoded as base64url. Only SHA-256 of that high-entropy opaque token is stored in PostgreSQL. The raw token is delivered only in `Set-Cookie`, never a JSON response, URL, localStorage, sessionStorage, or a script-readable cookie. A signing/encryption secret is unnecessary: the database lookup authenticates a random unguessable token, and no identity claims are encoded in it.

Cookies are host-only, Path=/, HttpOnly, have matching browser/server expiry, and use configurable SameSite. Secure defaults on in production and cannot be disabled there. The default Secure cookie name uses the `__Host-` prefix. Localhost development uses an insecure-transport cookie only in nonproduction. Deployment must set the production cookie variables correctly rather than copy the local template unchanged.

Sessions expire absolutely after SESSION_TTL (default seven days, allowed 5 minutes–30 days); they do not slide on every read. Login always creates a fresh session and revokes the session presented by that browser, preventing fixation. Other devices remain signed in. Logout deletes the current database session and clears the cookie, and is safe to repeat. Expired records are rejected immediately during authentication; startup/hourly cleanup removes them. There is no per-request lastSeen write, session-list UI, or logout-all-devices flow yet.

Safe player responses contain only User ID/email/creation date and profile ID/username/display name. Password hashes, token hashes, session IDs, and raw tokens are never serialized into REST player responses. Logs record operation/status and socket lifecycle IDs, not credentials, cookies, request bodies, or database URLs. See [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## REST and CSRF

REST provides registration/login/logout, current account information, profile updates, and health. Protected middleware reads the cookie, hashes the presented token, rejects missing/expired sessions, and attaches safe identity to response locals. PostgreSQL is the source of authentication truth; Redis is not involved.

All unsafe `/api` methods require both an exact `Origin` match to FRONTEND_URL and `X-Arena-Request: 1`, as well as application/json. Missing/null/untrusted origins are rejected, including on login/register/logout. CORS credentials are enabled only for the configured frontend origin. The custom header requires cross-origin preflight, so another origin cannot submit a simple cross-site form that passes validation. SameSite adds defense in depth; this exact-origin/custom-header strategy works even when SameSite=None is necessary. GET/HEAD must remain read-only. A future exception for webhooks/nonbrowser clients needs its own explicit authorization strategy rather than weakening this middleware. See [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

JSON bodies are capped at 16 KiB. Register/login share an IP limiter of 20 attempts per 15 minutes (including successful requests). It uses process-local memory for this single-server phase. TRUST_PROXY_HOPS defaults to zero; deployment must match the actual reverse-proxy topology to prevent spoofed forwarded IPs or all users being grouped behind one proxy. Production scaling requires a shared limiter/edge control. API responses use no-store and nosniff; server failures return generic messages.

## Socket.IO authentication

Handshake Origin must exactly match FRONTEND_URL. Middleware validates the same cookie/session as REST and rejects unauthenticated connections. Safe typed socket data contains userId, playerProfileId, username, displayName, plus internal sessionId and absolute session expiry for revocation/expiry enforcement. Client-supplied IDs are ignored.

The existing `system:ping` → `system:pong` diagnostic remains available only to authenticated sockets. Sessions are checked before each pong and every 30 seconds while idle. Logout/session rotation on this server disconnects matching sockets immediately. Expiration or revocation on another process is detected before further diagnostic responses and within 30 seconds for idle sockets. A socket's display name is a handshake snapshot; reconnection refreshes it. Timers/listeners are removed during disconnect/shutdown. Game input checks the handshake session expiry synchronously; local revocation immediately disconnects the controller. Room/game sync and leave commands additionally revalidate the database session.

## Redis and server lifecycle

Redis now stores room metadata, membership, readiness, host ownership, and lookup indexes. Matchmaking queues and distributed coordination are deferred. PostgreSQL remains the durable source of truth. Optional Redis has a bounded connection timeout and no reconnect loop in this phase; unavailable Redis logs a warning and does not block account functions. Restart after restoring Redis. HTTP health is liveness, reporting database `configured` and Redis connection status; it is not a database readiness probe. Authentication needs a reachable, migrated PostgreSQL database.

Shutdown closes Redis, Socket.IO and the Prisma pool, and stops session-cleanup timers, with a five-second deadline. Shutdown also stops the one simulation loop and releases all in-memory matches.

## Deployment

Intended providers remain Vercel (frontend), Railway (persistent Node/Socket.IO server), Supabase or Neon (PostgreSQL), and Upstash (Redis TCP/TLS `rediss://`, not the REST endpoint). Keep providers behind environment configuration. Use managed PostgreSQL TLS/pooling, HTTPS/WSS, and controlled proxy forwarding. Never expose private service URLs in NEXT_PUBLIC variables.

Prefer same-site custom domains such as `app.example.com` and `api.example.com` with SameSite=Lax, a host-only API cookie, and exact frontend CORS origin. Separate default Vercel/Railway domains are cross-site and require SameSite=None + Secure; browsers that block third-party cookies may still prevent login. Use same-site custom domains or a deliberately designed same-origin proxy for dependable production sessions. SameSite=None does not bypass browser privacy restrictions. No production deployment was performed.

Start with one server. Horizontal scaling later needs shared rate limiting, revocation distribution, a Socket.IO adapter, sticky sessions when polling is enabled, and ownership of authoritative simulations. A Redis adapter alone does not distribute a game simulation.

## Testing and isolation

Backend tests require an explicit TEST_DATABASE_URL whose database name ends in `_test`; they never fall back to DATABASE_URL. Each test file creates a random schema, applies the real migration there, runs real Prisma queries/HTTP/socket connections, and drops only that generated schema. Account cleanup is confined to those schemas. Both the PostgreSQL adapter and migration CLI use the same schema. Browser smoke verification uses a unique throwaway local account and deletes only that account afterward.

## Room storage and ownership

Room data is ephemeral and does not justify another PostgreSQL model. The single game-server process owns a unique Redis string key `arena:lobby:v1:<instance-uuid>`. Its JSON snapshot is:

```text
rooms:       roomId -> room metadata and ordered roster
codes:       six-character code -> roomId
playerRooms: playerProfileId -> roomId
```

Room metadata includes visibility, WAITING/STARTING/IN_GAME status and optional game ID, creation time, capacity, code, host ID, and roster. Each member includes only profile ID, username, display name, join time, ready/connected state, and host flag. A private `launchEndsAt` field bounds the two-second launch transition. Safe projections explicitly exclude this internal field and all account/session details. Public discovery is derived from WAITING PUBLIC rooms with spare capacity and excludes codes/private rooms entirely. No separately maintained public index can drift.

Every command enters one promise queue for this service, reads Redis, validates current state/membership/ownership, applies a synchronous mutation, commits the entire snapshot with one atomic SET, updates Socket.IO room subscriptions, and broadcasts authoritative state before acknowledging. Application validation errors do not commit a modified snapshot. This serializes cross-room player mappings as well as per-room capacity checks. Repeated joins to the same room and leaves are idempotent; ready commands set a value rather than toggling from stale client state. Crypto randomInt generates six-character codes with collision retries. A capacity of 100 rooms bounds snapshot size/work per operation. Room size is 2–8.

This is a **single game-server deployment**, not a distributed transaction system. The unique per-process key prevents one restarting process from overwriting an old process's room data, but separate processes would have separate lobbies and no global membership/code guarantees. Multi-instance operation must add owner routing, a global code/player directory, adapter broadcasts, and appropriate distributed atomic operations first. Do not point arbitrary instances at one snapshot: a local queue cannot coordinate multiple writers. Splitting bounded snapshots into per-room Redis structures is a future scaling option.

A 120-second TTL covers the whole snapshot and every nested lookup; a 30-second heartbeat and successful commands refresh it. Graceful shutdown deletes the namespace, and a crash expires it without orphaned lookup keys. Restart intentionally creates fresh rooms rather than claiming durable match recovery. Redis errors return safe UNAVAILABLE acknowledgements; there is no divergent in-memory room fallback. Accounts and HTTP health can still run without Redis. If connectivity is lost during a write, clients should reconnect/sync before retrying an uncertain operation. If disconnect cleanup cannot reach Redis, the namespace TTL bounds stale state. No Redis key/value internals are sent to clients.

## Membership and lifecycle

Creating a room auto-joins its authenticated creator as unready host. Public ID joining cannot access PRIVATE rooms; normalized code joining supports invitations. Joining requires WAITING and spare capacity, and the player-room mapping forbids simultaneous rooms. Roster insertion order is authoritative join order, so host departure promotes the first remaining entry deterministically, including tied timestamps. Final departure deletes metadata, code, and membership together.

A player's newest authenticated socket controls lobby membership; an older tab receives `lobby:replaced` and is disconnected. Replacement occurs before old-socket cleanup, and queued operations recheck current controller ownership, preventing stale sockets from deleting or modifying a new connection's membership. Socket.IO channels named `lobby:room:<id>` are reconciled from the stored snapshot, never from arbitrary client channel names.

Transient transport disconnect marks connected/ready false immediately and reserves membership for five seconds. Reconnect within grace cancels departure and requests current state; readiness must be set again. Grace expiry removes the player, transfers host, and deletes empty rooms. Explicit leave, client navigation disconnect, or server-side session revocation removes membership immediately. A reconnect after grace shows the public lobby; it does not silently invent previous membership. This is lobby refresh support, not Phase 9 full-match reconnection.

Everyone including host must be ready and connected, with at least two members. A host-only start changes WAITING to STARTING and emits `room:ready-to-start`. After two seconds the room commits IN_GAME with a server-generated UUID game ID, then the game manager initializes unique authoritative spawns. A departure or disconnection cancels STARTING. Timer cleanup and deadline reconciliation on subsequent operations prevent permanent STARTING states after a delayed callback. IN_GAME has no automatic completion/reset. CLOSED remains reserved vocabulary. New joins and ready changes are blocked once launch begins.

## Room protocol and frontend

`shared/index.d.ts` supplies typed contracts. The dependency-free `@arena/shared/game` runtime exports arena constants, deterministic movement, reconciliation, and interpolation used by both applications. Authentication remains server-owned. Commands are `rooms:list`, `room:sync`, `room:create`, `room:join`, `room:join-code`, `room:leave`, `room:set-ready`, and `room:start`; each has a strict validated payload and required acknowledgement. Success is `{ok:true,data}`; errors expose only `{ok:false,error:{code,message}}`. Missing acknowledgement functions are ignored without mutation. `room:state` and `rooms:list` provide live full-state updates; readiness confirmation and controller replacement have their own small events. No redundant joined/left event stream is required.

One `/play` hook owns the socket through its mount lifecycle. It reconnects with credentials, syncs current state, exposes connection/error/busy state, and removes listeners before disconnecting on unmount. Timeout errors ask the player to reconnect and verify membership, rather than treating uncertain commands as successful. Room controls show current player, host, code/copy feedback, capacity, connected/ready state, and disabled-start reasons. The Phaser engine is mounted only after a matching authoritative game snapshot arrives.

All commands revalidate the database session and use server-derived profile identity. Unknown fields/identity payloads are rejected. Limits are per authenticated profile (survive tab replacement): 40 room commands/10 seconds and three create attempts/minute, with eight pending commands/socket. Idle limiter entries expire. The existing 16 KiB inbound Socket.IO bound and origin restriction remain. Codes are invitations, not a replacement for authentication.

Room tests additionally require explicit TEST_REDIS_URL using database /15, use random test keys, and never FLUSHDB. They prove actual Redis snapshots/cleanup/TTL alongside real authenticated sockets and isolated PostgreSQL accounts.


## Authoritative simulation

`server/src/game/manager.ts` separates `GameInstance` (players, input, fixed steps, safe snapshots) from `GameManager` (room reconciliation, instance lookup, one shared scheduler, cleanup). Socket handlers validate transport ownership and route intent; they do not integrate positions. Room commits reconcile the in-memory manager before broadcasting room metadata. The first scheduled snapshot supplies game initialization; `game:sync` can explicitly retrieve the authenticated player's current instance. Snapshots replace redundant player-joined/left events.

The default `GAME_TICK_RATE=20` means one 50 ms simulation step. Environment validation permits integer rates 10–60. A monotonic `performance.now()` accumulator measures actual elapsed time, schedules the next wake against the remaining interval, and caps catch-up at five steps after an event-loop stall. Excess stalled wall time is discarded rather than allowing a huge movement leap. All games share one timer; there are no player simulation timers. Snapshots are broadcast every `ceil(tickRate / 10)` ticks, exactly 10 Hz at the default 20 Hz. At other settings the advertised snapshot rate is `tickRate / ceil(tickRate / 10)`. Snapshots include monotonic server time, tick, rates, room/game IDs, safe player labels, position, connected flag, and last processed sequence.

The world is centrally defined as 1600 × 900, radius 18, speed 260 world units/second. Up to eight initial players receive deterministic, distinct positions on a radius-230 ring around the center, in room join order. Input and acknowledgements start empty/zero. No client chooses a spawn. Initial combat state is full health, alive, and zero live counters. Shared movement normalizes diagonal direction, cancels opposing keys, and clamps the player's center to `[18,1582] × [18,882]`.

### Input and trust boundary

`game:input` carries only `{gameId, life, sequence, up, down, left, right}`. The life generation prevents pre-elimination inputs from applying after respawn; an omitted life is treated as the initial generation zero for the retained Phase 4 contract. It has no acknowledgement callback; snapshots acknowledge processed sequences. Zod rejects unknown fields, invalid booleans, nonintegral/unsafe sequences, and invalid game IDs. Identity comes exclusively from authenticated socket data. The active controller and unexpired session must own a connected player in an initialized IN_GAME instance. Inputs before launch, after removal, from a replaced tab, or targeting another match cannot control a player.

Each player has at most one queued intent: newer sequences replace it; duplicate/out-of-order sequences are ignored. Each simulation step consumes at most one intent and clears it. Missing packets stop movement; an old held-key message cannot move a disconnected or silent client indefinitely. A per-socket one-second window permits `2*tickRate + 10` packets, then rejects further packets. Errors are limited to one per second. Replacement sockets cannot multiply movement speed because simulation remains bounded per player per tick. The 16 KiB transport limit still applies. No per-tick or per-input database/Redis calls occur. Periodic session validation and diagnostic ping are separate from simulation.

### Prediction, reconciliation, and interpolation

The client samples WASD/arrows at the advertised fixed rate, applies the shared movement step locally, assigns increasing sequences, and sends volatile intents without replaying stale transport buffers. Pending inputs are capped at ten, and prediction stops if authoritative snapshots are missing for one second. For each authoritative snapshot, `reconcile` replaces the predicted origin with the canonical position, discards sequences at/below `lastSequence`, and replays the remaining fixed steps. Sequences resume from the server acknowledgement after refresh. Coalescing or packet loss can cause corrections; clients cannot use replay to change server authority. A 25 ms visual smoothing target softens local fixed-step/correction jumps without changing predicted or server coordinates.

The client keeps at most 24 snapshots. Remote rendering runs 120 ms behind the latest server time plus locally elapsed time since receipt, requiring no wall-clock synchronization. It linearly interpolates between surrounding snapshots and clamps to known endpoints if data is missing; it never extrapolates beyond the newest state. Latest membership removes departed markers immediately. The pure movement/reconciliation/interpolation functions are tested without a browser or timing dependencies.

### Arena UI and lifecycle

The Phaser scene draws an original dark grid, center ring, visible boundary, outlined player markers, and safe labels. The local label explicitly includes “You”. A smoothly following camera stays within world bounds; responsive viewport sizing/zoom never changes logical world coordinates. HUD shows room name, roster count, connection, a keyboard-accessible Leave Arena button, and visible WASD/arrow instructions. A default-off Network debug button shows tick/rates, round-trip ping, pending count, predicted/canonical positions, and safe player positions. Keyboard input is suspended while a form/button has focus; click/tab into the arena to move. Touch movement controls are not implemented.

Intentional `game:leave` uses the existing serialized room leave operation. Game reconciliation removes the player; subsequent snapshots remove their marker. Earliest remaining member becomes metadata host, but game authority remains the server. The final departure removes room indices and the game instance. Transport loss immediately clears pending movement and freezes the player, while the existing five-second grace reserves membership. Reconnect replaces the controller, cancels expiry, restores connected state, and resumes the same in-memory position and game ID. Refresh recreates exactly one Phaser instance; cleanup destroys the previous instance/listeners. Explicit navigation, logout, or namespace disconnect leaves immediately. Grace expiry removes the frozen player even if Redis cleanup fails; Redis's existing TTL bounds stale metadata.

High-frequency positions, inputs, acknowledgements, and simulation ticks live only in process memory. Redis stores room metadata, match ID/status, and membership; PostgreSQL stores accounts/sessions. Restart loses active games intentionally. Redis outage can block sync/leave/room commands while an existing in-memory game continues; recovery is not durable and requires operational restart if the Redis client becomes unavailable. This phase has no multi-server ownership, latency compensation for combat, persistent recovery, load benchmark, touch controls, player collision, obstacles, persistent statistics, matchmaking, or match completion.


## Phase 5 combat architecture

`server/src/game/combat.ts` owns `CombatSimulation`: validated aim/fire intent, projectile state, swept collisions, damage, elimination, and tick-based respawn. `player.ts` separates internal runtime fields from public player state. Each GameInstance owns one combat simulation and the existing GameManager still runs one fixed loop for every room. Socket handlers only authorize/rate-limit and route intent. There are no combat database calls, Redis writes, per-shot timers, or per-projectile intervals.

Combat defaults are centralized and frozen in `COMBAT` in `shared/game.js`:

| Setting | Value |
| --- | --- |
| Weapon | Basic Blaster; click or modest automatic fire while held |
| Maximum health | 100 |
| Damage | 25 per hit |
| Projectile speed | 800 world units/second |
| Projectile radius | 5 units (player radius remains 18) |
| Fire cooldown | 300 ms; six ticks at 20 Hz |
| Projectile lifetime | 2,000 ms; 40 ticks at 20 Hz |
| Respawn delay | 3,000 ms; 60 ticks at 20 Hz |
| Muzzle offset | 26 units, bounded to the arena |
| Spawn protection | Deferred; no invulnerability window |

Timings convert to `ceil(milliseconds * tickRate / 1000)` simulation ticks. The server owns deadlines, so clients cannot shorten cooldown, lifetime, or respawn by changing timestamps or frame rates. Changing the shared constants configures the weapon/respawn defaults; the combat module also accepts a typed configuration for deterministic isolated use. There is no ammunition or reload system.

### Aim and fire protocol

Both `game:aim` and `game:fire` carry only `{gameId, life, sequence, aimX, aimY}`. A strict Zod schema rejects unknown fields, nonfinite/out-of-range components, near-zero vectors, and invalid sequence/life values. Components must be within [-1,1]; the server normalizes valid nonzero directions. `game:aim` updates safe synchronized aim and does not shoot. `game:fire` queues at most one normalized fire intent until the next simulation tick.

The socket must be authenticated, current for that profile, and unexpired. Game membership/connected state must match the server's live instance. Dead-player and previous-life intents are ignored: legitimate packets can arrive after elimination, so those do not produce misleading control errors. They never queue movement or shots. Unknown games, outsiders, malformed payloads, and expired controllers are rejected. Aim/fire share a separate 60-events/second secondary socket limit; movement retains its previous limit. All game errors remain throttled to at most one per second.

Aim/fire sequences are monotonically increasing together; `lastCombatSequence` is included for refresh recovery. Duplicate/stale sequences cannot replay a shot. The weapon cooldown is enforced again when consuming the queued shot, independent of event volume. Coalescing means even a burst of hundreds of packets cannot create hundreds of projectiles. The next-tick eligibility check allows firing exactly at the cooldown deadline without adding another tick of latency. A tab takeover clears queued fire but preserves weapon cooldown, health, counters, and respawn deadlines.

### Projectile lifecycle and collisions

Every shot gets a server-generated UUID. Spawn comes from the canonical player position plus the normalized muzzle offset, clamped within the world. Direction, speed, damage, birth tick, and expiry tick are all server-owned. Safe projectile snapshots include only ID, owner profile ID, position, and direction; internal speed/damage/deadlines are not serialized. New shots appear after that tick's existing-projectile collision phase and begin travelling on the following tick.

Each tick advances existing projectiles, removes expired projectiles, sweeps against living player circles, applies at most one nearest hit, and removes world-exiting projectiles. The sweep solves the earliest segment/circle intersection at combined radius 23. It uses relative projectile/target motion between the beginning and end of the tick, reducing tunneling even when a moving target crosses a bolt. Stable roster iteration breaks equal-distance ties. The short player-center→muzzle segment is also swept against opponents so close/overlapping targets cannot be skipped. Own projectiles always exclude their owner. There is no piercing, player collision, or obstacle geometry.

A hit reduces health by 25 and clamps at zero. At zero, the target becomes dead exactly once, increments deaths, and credits one elimination to the projectile owner if still present. Movement and queued fire clear. Already-dead targets are skipped, so they cannot be repeatedly eliminated. Projectiles fired before an owner's death remain active and can earn posthumous eliminations; explicit leave removes all of that owner's projectiles. Health/counters are live match memory only and never create durable statistics or leaderboard records.

### Respawn, disconnects, and refresh

The server sets an internal respawn tick and publishes only the remaining delay in milliseconds. At the deadline it restores full health, marks alive, clears queued movement/fire, resets weapon availability and aim, and increments the player's life generation. Movement sequence acknowledgements advance to discard pre-death pending state. The life generation prevents packets sent before death from moving/shooting the newly respawned player.

Respawn selects the candidate with greatest minimum distance from other living players among nine fixed points: x ∈ {100,800,1500}, y ∈ {100,450,800}. Stable candidate order breaks ties. Disconnected living players count as occupied. This is a deterministic separation heuristic, not a guarantee against every in-flight projectile; spawn protection is deliberately deferred. A disconnected player can respawn during grace but remains frozen and cannot fire until connection ownership is restored.

During the existing five-second transport grace, players remain damageable. Disconnect immediately clears pending control; already-fired projectiles keep travelling. This prevents disconnect-to-invulnerability abuse. Reconnect/refresh uses the existing in-memory player and preserves health, position, alive/dead state, countdown, cooldown, eliminations, deaths, and membership. A second tab becomes the only controller; old handlers check ownership again and cannot act. Grace expiry/explicit leave removes the player and owned projectiles; final departure cleans the room and game instance. No winner selection or automatic match termination is added.

### Frontend combat boundaries

`ArenaInput` owns keyboard focus and mouse intent. It fires the first shot on canvas pointer-down so a quick down/up between animation frames is not lost, then repeats while held at the shared cooldown. React buttons never arm firing. Pointer release, leaving the canvas, window blur, death, or loss of arena focus stops held fire. Gameplay only captures movement with arena focus. Pointer coordinates are transformed through the Phaser camera into an aim direction; coordinates never become server projectile positions.

`PlayerRenderer` owns marker/name rendering, aim barrels, compact health bars, a brief white hit flash, dead opacity/text, and respawn position snapping. `ProjectileRenderer` draws original procedural glowing bolts from authoritative snapshot IDs only. It visually advances the latest position along the known direction for at most 100 ms between 10 Hz snapshots, clamps at world edges, corrects from each next snapshot, and immediately removes IDs missing from the newest state. It never creates hits or damage. Very short-lived shots may only be represented by the resulting health/flash state between snapshots; no redundant effect events are sent.

Movement prediction remains independent of combat. The shared reconciliation function clears pending inputs when dead and only replays inputs matching the current life. Remote player interpolation snaps across life/alive transitions instead of interpolating a respawn across the map. `ArenaNetwork` exposes snapshot subscriptions to a small React combat HUD through `useSyncExternalStore`; Phaser still owns per-frame rendering. The HUD shows textual health, Alive/Respawning countdown, eliminations/deaths, Basic Blaster, existing room/connection information, and Leave Arena. Controls read “Move: WASD / Arrows · Aim: Mouse · Fire: Left Click (hold)”. Debug remains optional and off by default.

With eight players, 300 ms cooldown and two-second lifetime bound steady projectile counts to about 56 per game, usually fewer due to collisions/boundaries. Sweeping every projectile against at most eight players is deliberately simple at this scale. Snapshots remain 10 Hz by default and contain no visual particle/event noise. No production load test, lag compensation, hit prediction, touch combat scheme, ammo/reload, spawn protection, persistent scores, match history, win conditions, matchmaking, leaderboard, spectators, bots, or deployment is included.

## Phase 6: match lifecycle and durable results

Rooms now follow `WAITING → STARTING → IN_GAME → FINISHED → WAITING`. The server allocates the match UUID during STARTING and idempotently creates a PostgreSQL Match and its original participant rows before committing IN_GAME to Redis. The persisted server start time initializes the GameInstance. `MATCH_DURATION_SECONDS` defaults to 180 and accepts integers from 5 through 3600. A monotonic deadline determines remaining time and completion; the simulation catch-up cap cannot extend the match. Clients receive remaining milliseconds in 10 Hz snapshots. The HUD shows textual time and emphasizes the last ten seconds.

One legitimate elimination awards one score point and one elimination; the victim gains one death. Deaths do not deduct points. Time expiry is the competitive finish condition. Standings order by descending score, descending eliminations, ascending deaths, then ascending stable profile ID. Placement is an ordinal display position. Everyone tied for the best meaningful metrics is marked a tied winner; the stable ID orders those rows without arbitrarily selecting a champion. A single winner sets the nullable winner relation. Departed players remain eligible based on their earned statistics. An empty room ends early with `EMPTY_ROOM`, elapsed duration, and no winner.

Finishing is synchronous and idempotent in GameInstance: clear projectiles and pending inputs, stop combat/movement/respawn processing, freeze final standings, then notify clients. No client command can finish a match, supply results, or alter the timer. Movement and combat validation, session expiry, rate limits, membership, life generations, and newest-controller protections remain in effect. The UI destroys Phaser on completion and disables network gameplay input. Late packets for a previous match are ignored.

### Persistence and failure behavior

Migration `20260910040000_match_results` adds MatchStatus, Match, and MatchParticipant. Match stores room identity/name, configured duration, start/end, outcome, actual duration, and nullable winner. Participants preserve safe identity snapshots, original profile key, score, eliminations, deaths, placement, winner, and early-departure flag. A unique `(matchId, participantKey)` constraint prevents duplicates. Profile foreign keys use SET NULL so historical identity snapshots survive account deletion; deleting a Match cascades its participants. Match status/end-time and participant profile/match indexes support recent history queries.

Finalization uses one Prisma transaction: conditionally claim an IN_GAME record, write final match metadata, validate the complete participant set, and update every standing. Failure rolls back all changes. Concurrent/repeated calls observe FINISHED and cannot overwrite results. Match start retries reuse the same match UUID and original start time. Live scores, movement, projectiles, timer updates, and snapshots never write PostgreSQL or Redis. Database work occurs only at start, finish, and authenticated history reads.

Finish persistence and room metadata updates each retry at most three times, with 250 ms and 1000 ms delays. Safe structured warnings contain event/attempt, not account data. The immutable result is broadcast immediately with SAVING, then SAVED or FAILED; a failed save does not change the gameplay outcome. Start persistence failure leaves STARTING and retries on subsequent room operations or the 30-second heartbeat. PostgreSQL and Redis do not share a transaction: a crash or uncertain Redis commit can leave an unfinished database record. Durable active-match/crash recovery and an outbox are not implemented. A prolonged database outage can prevent launches; a prolonged Redis outage can prevent return/reset. These are explicit single-process Phase 6 limitations.

### Departures, retention, and rematches

Explicit leave or expired reconnect grace removes active control and owned projectiles while preserving the original participant ledger. No artificial elimination is awarded. The existing five-second network grace freezes movement while leaving the player damageable. Reconnection within grace preserves timer, health, score, life/respawn state, and position. Finishing during grace includes the disconnected participant; reconnecting restores the immutable result. Results remain accessible via authenticated history after live membership expires.

FINISHED instances stop high-frequency broadcasts and remain attached to their room. Return to Lobby records the returning member and shows the room while others finish viewing results. When all remaining members return (or a non-returned member leaves), the room resets readiness and clears match metadata. Otherwise it resets after 120 seconds on the next room operation or heartbeat, normally within 120–150 seconds. The old GameInstance is removed on reconciliation; empty rooms remove it immediately. The lobby's 100-room cap bounds concurrent retained instances. Cleanup relies on Redis availability. Every rematch requires readiness again and receives a new UUID, database record, GameInstance, full health, and zero statistics.

### History and presentation

Authenticated `GET /api/matches?limit=10` accepts 1–25 results, ordered by endedAt descending then match UUID descending. `GET /api/matches/:matchId` requires a valid UUID and participation; unauthorized/nonexistent details return 404. Only FINISHED records appear. Both use the authenticated profile, explicit safe projections, and bounded relation queries; clients cannot select another profile. No emails, session IDs, tokens, room codes, or account relations are returned.

The `/matches` route presents recent results with expandable semantic standings, date, duration, placement, score, eliminations, and deaths. Dashboard shows the latest completed match. Results identify You and Winner/Tied winner in text, feature keyboard-accessible Return/Leave controls, and use contained horizontal scrolling for narrow standings tables. Global rankings, ratings, matchmaking, bots, spectators, advanced modes, durable live recovery, and deployment remain outside this phase.

## Phase 7: automated matchmaking and MMR

`/play` now offers automatic 1v1 matchmaking alongside the existing manual room flow. The shared state contract is `IDLE → QUEUED → MATCH_FOUND → ACCEPTED → ASSIGNED`; cancellation returns to IDLE (the command acknowledges CANCELLED), and unanswered offers expose TIMED_OUT for up to 60 seconds. UNAVAILABLE is used when initial matchmaking recovery fails. One authoritative `matchmaking:state` event handles updates; join/cancel/sync accept empty strict payloads, and accept/decline accept only a proposal UUID. Clients cannot choose opponents, rating, priority, rooms, timestamps, or deadlines.

### Queue storage, ownership, and concurrency

The existing single-process room owner now coordinates two separate Redis JSON documents: its random `arena:lobby:v1:<process-instance>` namespace and `<namespace>:matchmaking:v1`. The matchmaking document contains an entry map keyed by profile ID, proposals keyed by server UUID, pair cooldowns, and short-lived timeout notices. Each entry stores only safe public identity, rating snapshot, original queue timestamp, optional disconnect timestamp, and optional proposal lookup. Proposals hold two profile IDs, accepted IDs, and an absolute server deadline. Successful assignment is represented only in the normal room/player-room maps, avoiding redundant ownership records.

All queue and manual-room mutations run through the same serialized owner transaction lane. One MGET reads both documents; one MULTI/EXEC commits both SETs with the same 120-second TTL. There is no asynchronous candidate-selection gap between queue checks and assignment. Concurrent joins, cancellation, acceptance, manual joins, and matchmaker cycles therefore cannot consume a participant twice. Queue membership blocks manual create/join, and room membership blocks queue entry. Only a successfully committed mutation publishes client state. Session/controller guards run inside the serialized operation after asynchronous authentication/rating reads.

This is deliberately one owner per random namespace, consistent with the in-memory GameManager. MULTI gives an atomic two-document commit; the process lane provides read-modify-write isolation. It is not a distributed locking scheme: multiple independent room owners must never share a namespace. Horizontal ownership/sharding, Redis Cluster hash-slot support, and distributed matchmaking are deferred. Shutdown clears the service loop and both owned keys. A new server process uses a new namespace; crashed-instance data expires after 120 seconds and cannot launch a new room in the new process.

### Selection and acceptance

A single one-second matchmaker loop reads at most 200 entries. It sorts by oldest original queue timestamp, then stable profile ID. Each oldest eligible player receives the first compatible remaining player in that ordering. A player is used at most once per cycle. Disconnected and already-proposed entries are excluded. Candidate selection is bounded O(n²) over 200 entries, with no database query per candidate and no per-player timers.

The centralized policy starts at ±100 MMR, expands to ±200 at 10 seconds and ±300 at 20 seconds, and permits any rating difference after 30 seconds. Compatibility uses the larger of the two players' age-based ranges, allowing the older search to broaden while retaining deterministic oldest-compatible priority. Original queue age includes time spent in a proposal. Active queue entries expire after ten minutes as stale-state protection.

Each pair receives a ten-second acceptance deadline. One acceptance waits; both acceptances assign only when both entries are connected. Accepting at/after the deadline cannot revive a proposal. Decline removes the declining player; connected accepted opponents requeue with their original timestamp. Non-accepted opponents return to IDLE. On timeout, connected accepted players requeue, while unanswered/disconnected players receive TIMED_OUT. A fifteen-second pair cooldown prevents an immediately repeated proposal. Both players can find different compatible opponents during that cooldown. Proposal expiry, queue grace expiry, stale entries, cooldowns, and timeout notices are handled by the single cycle, not per-queued-player timers.

### Assignment and recovery

The service creates a PRIVATE, capacity-two room marked MATCHMAKING, without a join code or public listing. The oldest selected player occupies the required host field for compatibility, but neither player presses Start. Accepted connected players are ready; the shared room launch helper creates STARTING and the existing launcher persists Match/participants before IN_GAME. GameManager, simulation, combat, timer, snapshots, finish, and history remain the same pipeline used by manual rooms.

Network disconnect while queued retains the entry for five seconds, but excludes it from pairing. Reconnection preserves queue age and rating. During a proposal, recovery lasts only until its original acceptance deadline; accepted state is retained, and assignment waits for both connections. Logout, explicit navigation/disconnect, and cancellation clean the proposal/entry immediately. Newest-tab controller replacement preserves state while rejecting old handlers. Active game recovery remains the existing five-second grace. Disconnect/leave during automatic STARTING cancels the room safely; the connected opponent returns to idle. No rating penalty applies to declined, timed-out, or unstarted matches.

Return to Lobby from matchmade results releases that player to Find Match; the other player can finish viewing results. Automatic result retention eventually releases all remaining members and deletes the code-less room. Manual results retain their existing shared-room reset/rematch behavior. Players who leave a matchmade game early cannot enter another automatic match while the old in-memory match is active, and pending finalization also blocks entry. This prevents overlapping rated matches using stale pre-match ratings. Manual room participation remains unranked.

Redis command failures publish no fabricated queue success and do not reconcile an empty lobby over active games. If a namespace holding queue/game state disappears after Redis data loss or TTL expiry, operations fail closed and the application must be restarted to establish a fresh namespace. Existing connected in-memory gameplay can finish and persist results, but room/queue recovery is unavailable until restart. Empty/waiting-only room namespaces retain the previous TTL cleanup behavior. If Redis restarts with its persisted keys intact, operations resume normally. No durable queue/proposal or live-match recovery is claimed.

### Rating persistence

Migration `20260911050000_matchmaking_rating` adds integer PlayerProfile.rating defaulting to 1000, Match.roomType defaulting to MANUAL, and nullable participant ratingBefore/ratingAfter/ratingDelta. Existing profiles receive 1000; historical matches remain manual, with null rating fields. Matchmade start records both database profile ratings. Queue compatibility uses a server-read rating snapshot, never client data. Auth/profile responses include the current player's rating; profile update validation does not accept rating changes.

The pure Elo module uses K=32 and `E = 1 / (1 + 10^((opponent-rating)/400))`, with actual 1/0/0.5 for win/loss/tie. Participants are ordered by stable profile ID, and the first delta is `sign(raw) × round(abs(raw))`; the opponent receives its exact negative. This deterministic symmetric rounding preserves integer, zero-sum updates. No arbitrary rating floor is imposed. Equal 1000-rated players receive +16/-16 after a decisive result. An equal-rating tie changes neither; an unequal-rating tie moves points toward the underdog.

Only TIME_LIMIT completions of matchmade 1v1 matches affect ratings. Manual matches and EMPTY_ROOM termination do not. The existing conditional IN_GAME→FINISHED transaction now also validates rating snapshots, computes both changes from pre-match values, updates both profiles, and stores both participant after/delta fields. Any failure rolls back match, statistics, and ratings together. Duplicate/concurrent finalization cannot apply MMR twice. Incrementing profile ratings by the calculated delta avoids overwriting unrelated future administrative changes. Finalization publishes rating-enriched safe results after persistence succeeds; gameplay standings stay immutable while SAVING/FAILED is displayed.

### UI, security, and boundaries

The matchmaking card shows Find Match, Searching with preserved elapsed time and rating, Match Found with textual deadline and Accept/Decline, Waiting for opponent, and Preparing Arena. Manual controls remain available when idle. Controls are native keyboard-accessible buttons, state headings use polite announcements, and mobile cards remain within the viewport. Presentation timers use server timestamps plus monotonic elapsed browser time and never determine eligibility or acceptance.

Results and history display the current participant's `before → after (delta)` only when a rating update exists. Manual records never imply MMR movement. Authentication, safe identity projection, room/match access control, session validation, newest-controller checks, and shared command limits (40 commands/10 seconds, eight pending operations) remain in effect. Rating reads occur on queue entry and match start; writes occur only in match finalization. No queue queries or rating writes were added to simulation ticks. Leaderboards, seasons, divisions, parties, teams, tournaments, spectators, bots, and deployment remain deferred to future phases; Phase 8 is not implemented.
