# Architecture

Phase 4 extends the existing npm workspace monorepo. React/Next.js handles account UI; Express handles REST; Socket.IO shares the Node HTTP server; Prisma/PostgreSQL owns player identity and sessions. Redis owns ephemeral rooms; it remains optional for authentication. Authoritative movement runs in server memory. Combat, matchmaking, leaderboards, and match completion remain deferred.

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


## Phase 4 authoritative simulation

`server/src/game/manager.ts` separates `GameInstance` (players, input, fixed steps, safe snapshots) from `GameManager` (room reconciliation, instance lookup, one shared scheduler, cleanup). Socket handlers validate transport ownership and route intent; they do not integrate positions. Room commits reconcile the in-memory manager before broadcasting room metadata. The first scheduled snapshot supplies game initialization; `game:sync` can explicitly retrieve the authenticated player's current instance. Snapshots replace redundant player-joined/left events.

The default `GAME_TICK_RATE=20` means one 50 ms simulation step. Environment validation permits integer rates 10–60. A monotonic `performance.now()` accumulator measures actual elapsed time, schedules the next wake against the remaining interval, and caps catch-up at five steps after an event-loop stall. Excess stalled wall time is discarded rather than allowing a huge movement leap. All games share one timer; there are no player simulation timers. Snapshots are broadcast every `ceil(tickRate / 10)` ticks, exactly 10 Hz at the default 20 Hz. At other settings the advertised snapshot rate is `tickRate / ceil(tickRate / 10)`. Snapshots include monotonic server time, tick, rates, room/game IDs, safe player labels, position, connected flag, and last processed sequence.

The world is centrally defined as 1600 × 900, radius 18, speed 260 world units/second. Up to eight initial players receive deterministic, distinct positions on a radius-230 ring around the center, in room join order. Input and acknowledgements start empty/zero. No client chooses a spawn. Shared movement normalizes diagonal direction, cancels opposing keys, and clamps the player's center to `[18,1582] × [18,882]`.

### Input and trust boundary

`game:input` carries only `{gameId, sequence, up, down, left, right}`. It has no acknowledgement callback; snapshots acknowledge processed sequences. Zod rejects unknown fields, invalid booleans, nonintegral/unsafe sequences, and invalid game IDs. Identity comes exclusively from authenticated socket data. The active controller and unexpired session must own a connected player in an initialized IN_GAME instance. Inputs before launch, after removal, from a replaced tab, or targeting another match cannot control a player.

Each player has at most one queued intent: newer sequences replace it; duplicate/out-of-order sequences are ignored. Each simulation step consumes at most one intent and clears it. Missing packets stop movement; an old held-key message cannot move a disconnected or silent client indefinitely. A per-socket one-second window permits `2*tickRate + 10` packets, then rejects further packets. Errors are limited to one per second. Replacement sockets cannot multiply movement speed because simulation remains bounded per player per tick. The 16 KiB transport limit still applies. No per-tick or per-input database/Redis calls occur. Periodic session validation and diagnostic ping are separate from simulation.

### Prediction, reconciliation, and interpolation

The client samples WASD/arrows at the advertised fixed rate, applies the shared movement step locally, assigns increasing sequences, and sends volatile intents without replaying stale transport buffers. Pending inputs are capped at ten, and prediction stops if authoritative snapshots are missing for one second. For each authoritative snapshot, `reconcile` replaces the predicted origin with the canonical position, discards sequences at/below `lastSequence`, and replays the remaining fixed steps. Sequences resume from the server acknowledgement after refresh. Coalescing or packet loss can cause corrections; clients cannot use replay to change server authority. A 25 ms visual smoothing target softens local fixed-step/correction jumps without changing predicted or server coordinates.

The client keeps at most 24 snapshots. Remote rendering runs 120 ms behind the latest server time plus locally elapsed time since receipt, requiring no wall-clock synchronization. It linearly interpolates between surrounding snapshots and clamps to known endpoints if data is missing; it never extrapolates beyond the newest state. Latest membership removes departed markers immediately. The pure movement/reconciliation/interpolation functions are tested without a browser or timing dependencies.

### Arena UI and lifecycle

The Phaser scene draws an original dark grid, center ring, visible boundary, outlined player markers, and safe labels. The local label explicitly includes “You”. A smoothly following camera stays within world bounds; responsive viewport sizing/zoom never changes logical world coordinates. HUD shows room name, roster count, connection, a keyboard-accessible Leave Arena button, and visible WASD/arrow instructions. A default-off Network debug button shows tick/rates, round-trip ping, pending count, predicted/canonical positions, and safe player positions. Keyboard input is suspended while a form/button has focus; click/tab into the arena to move. Touch movement controls are not implemented.

Intentional `game:leave` uses the existing serialized room leave operation. Game reconciliation removes the player; subsequent snapshots remove their marker. Earliest remaining member becomes metadata host, but game authority remains the server. The final departure removes room indices and the game instance. Transport loss immediately clears pending movement and freezes the player, while the existing five-second grace reserves membership. Reconnect replaces the controller, cancels expiry, restores connected state, and resumes the same in-memory position and game ID. Refresh recreates exactly one Phaser instance; cleanup destroys the previous instance/listeners. Explicit navigation, logout, or namespace disconnect leaves immediately. Grace expiry removes the frozen player even if Redis cleanup fails; Redis's existing TTL bounds stale metadata.

High-frequency positions, inputs, acknowledgements, and simulation ticks live only in process memory. Redis stores room metadata, match ID/status, and membership; PostgreSQL stores accounts/sessions. Restart loses active games intentionally. Redis outage can block sync/leave/room commands while an existing in-memory game continues; recovery is not durable and requires operational restart if the Redis client becomes unavailable. This phase has no multi-server ownership, latency compensation for combat, persistent recovery, load benchmark, touch controls, player collision, obstacles, weapons, health, respawning, statistics, matchmaking, or match completion.
