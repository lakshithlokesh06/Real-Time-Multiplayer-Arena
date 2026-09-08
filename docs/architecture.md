# Architecture

Phase 2 extends the Phase 1 npm workspace monorepo. React/Next.js handles account UI; Express handles REST; Socket.IO shares the Node HTTP server; Prisma/PostgreSQL owns player identity and sessions. Redis stays optional. No gameplay, room, matchmaking, leaderboard, or match system has been implemented.

## Frontend boundaries

Next.js App Router serves public `/`, `/login`, `/register`, and the future `/leaderboard` placeholder. `/dashboard`, `/profile`, and `/play` use a client authentication gate. They render loading UI until `/api/auth/me` resolves and redirect unauthenticated visitors to `/login`. Already signed-in users on login/register go to the dashboard. These gates are user-experience boundaries, not the security boundary: all private REST data and sockets are authorized on the server. Static route HTML contains no player data.

`AuthProvider` restores a session, exposes loading/authenticated/unauthenticated/error states, and updates identity after registration, login, profile updates, or logout. Request generations prevent a slow initial `/me` response from overwriting a newer login/logout. Focus refresh and a BroadcastChannel notification synchronize tabs without putting credentials or account data in browser storage. A failed session check displays a retry state rather than pretending the user logged out.

`services/api.ts` centralizes fetch, credentials, safe errors, JSON, and the CSRF header. `services/auth.ts` owns account endpoints. `services/socket.ts` sets `withCredentials: true`; it supplies no client identity as proof of authentication. `/play` verifies a diagnostic socket connection and renders the existing Phaser preview. Phaser remains dynamically imported with SSR disabled, creates one game per mount, and destroys it on unmount. React owns the surrounding UI; Phaser owns its canvas and scenes.

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

Handshake Origin must exactly match FRONTEND_URL. Middleware validates the same cookie/session as REST and rejects unauthenticated connections. Safe typed socket data contains userId, playerProfileId, username, displayName, plus an internal sessionId for revocation. Client-supplied IDs are ignored.

The existing `system:ping` → `system:pong` diagnostic remains available only to authenticated sockets. Sessions are checked before each pong and every 30 seconds while idle. Logout/session rotation on this server disconnects matching sockets immediately. Expiration or revocation on another process is detected before further diagnostic responses and within 30 seconds for idle sockets. A socket's display name is a handshake snapshot; reconnection refreshes it. Timers/listeners are removed during disconnect/shutdown. No game events or room membership have been added.

## Redis and server lifecycle

Redis will later support presence, matchmaking queues, room metadata, distributed coordination, and rate limiting. PostgreSQL remains the durable source of truth. Optional Redis has a bounded connection timeout and no reconnect loop in this phase; unavailable Redis logs a warning and does not block account functions. Restart after restoring Redis. HTTP health is liveness, reporting database `configured` and Redis connection status; it is not a database readiness probe. Authentication needs a reachable, migrated PostgreSQL database.

Shutdown closes Redis, Socket.IO and the Prisma pool, and stops session-cleanup timers, with a five-second deadline. The future authoritative game simulation still belongs on the persistent server: clients will submit intent; the server will validate movement/combat and decide outcomes. No simulation exists yet.

## Deployment

Intended providers remain Vercel (frontend), Railway (persistent Node/Socket.IO server), Supabase or Neon (PostgreSQL), and Upstash (Redis TCP/TLS `rediss://`, not the REST endpoint). Keep providers behind environment configuration. Use managed PostgreSQL TLS/pooling, HTTPS/WSS, and controlled proxy forwarding. Never expose private service URLs in NEXT_PUBLIC variables.

Prefer same-site custom domains such as `app.example.com` and `api.example.com` with SameSite=Lax, a host-only API cookie, and exact frontend CORS origin. Separate default Vercel/Railway domains are cross-site and require SameSite=None + Secure; browsers that block third-party cookies may still prevent login. Use same-site custom domains or a deliberately designed same-origin proxy for dependable production sessions. SameSite=None does not bypass browser privacy restrictions. No production deployment was performed.

Start with one server. Horizontal scaling later needs shared rate limiting, revocation distribution, a Socket.IO adapter, sticky sessions when polling is enabled, and ownership of authoritative simulations. A Redis adapter alone does not distribute a game simulation.

## Testing and isolation

Backend tests require an explicit TEST_DATABASE_URL whose database name ends in `_test`; they never fall back to DATABASE_URL. Each test file creates a random schema, applies the real migration there, runs real Prisma queries/HTTP/socket connections, and drops only that generated schema. Account cleanup is confined to those schemas. Both the PostgreSQL adapter and migration CLI use the same schema. Browser smoke verification uses a unique throwaway local account and deletes only that account afterward.
