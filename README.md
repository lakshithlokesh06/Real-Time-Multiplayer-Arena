# 🎮 Real-Time Multiplayer Arena

<<<<<<< HEAD
A production-oriented browser-based multiplayer arena game built with **Next.js, Phaser, Node.js, Socket.IO, PostgreSQL, Prisma, and Redis**.

The project is being developed incrementally with a focus on secure player identity, real-time networking, authoritative multiplayer architecture, scalable game systems, and modern full-stack engineering.

> **Current Status:** Phase 2 — Player Accounts, Authentication & Profiles ✅

---

## 📌 Project Overview

Real-Time Multiplayer Arena is a browser-based multiplayer game where players will eventually join live arenas, move and fight in real time, compete through matchmaking, track their performance, and climb competitive leaderboards.

The application separates the web/game client from an authoritative multiplayer server.

```text
Browser
   │
   ▼
Next.js + React + Phaser
   │
   ├── REST API
   └── Socket.IO
          │
          ▼
Node.js + Express Game Server
          │
          ├── PostgreSQL + Prisma
          └── Redis
```

The server is designed to remain authoritative over sensitive gameplay state rather than trusting the browser.
=======
A browser arena portfolio project with a Next.js/Phaser frontend and a persistent Express/Socket.IO backend.

**Current status: Phase 2 — Player Accounts, Authentication & Profiles.** Email/password registration, login/logout, PostgreSQL-backed sessions, account dashboard, editable display names, protected routes, and authenticated diagnostic sockets are implemented. The Phaser arena remains an engine preview; there is no multiplayer gameplay yet.

## Stack and structure

npm workspaces · Next.js 16 / React 19 · strict TypeScript · Tailwind CSS 4 · Phaser 3 · Express 5 · Socket.IO 4 · Prisma 7 + PostgreSQL adapter · Argon2id · Zod · node-redis.

```text
frontend/src/
  app/                  # Public and protected App Router pages
  components/           # Auth provider/gate/forms, navigation, dashboard/profile
  services/             # Central API client, auth calls, credentialed sockets
  types/                # Safe player/registration contracts
  game/                 # Existing client-only Phaser preview
  lib/                  # Public service origins
server/
  src/config/           # Validated env, Prisma database, optional Redis
  src/services/         # Authentication/session service and validation
  src/middleware/       # Session authorization, CSRF checks, safe errors
  src/routes/           # Auth, profile, health
  src/socket/           # Authenticated socket lifecycle
  src/types/            # Safe typed socket context/events
  src/utils/            # Structured logging and HTTP errors
  prisma/               # User, PlayerProfile, Session schema and migration
  test/                 # Real-database integration tests and isolated fixtures
docs/                   # Architecture and verification
docker-compose.yml      # PostgreSQL + Redis only
.env.example            # Infrastructure template
package.json            # Workspace commands
package-lock.json
```

See [architecture](docs/architecture.md) for security decisions and the provider-independent Vercel/Railway/PostgreSQL/Upstash deployment plan.
>>>>>>> 0dfc352 (Add player authentication and profiles)

---

<<<<<<< HEAD
# ✨ Planned Features
=======
Use a working **Node.js 24** installation (see `.nvmrc`), npm, Docker Desktop/Engine, and Docker Compose v2 or newer. From the repository root, for a fresh checkout:
>>>>>>> 0dfc352 (Add player authentication and profiles)

* Secure player accounts ✅
* Player profiles ✅
* Authenticated realtime connections ✅
* Public game rooms
* Private rooms and room codes
* Player ready system
* Real-time player movement
* Authoritative game state
* Arena combat
* Health and damage
* Death and respawning
* Power-ups
* Match lifecycle
* Matchmaking
* Match results
* Player statistics
* Match history
* Competitive leaderboards
* Reconnection support
* Spectator mode
* AI bots
* Presence tracking
* Production deployment

---

# 🧰 Tech Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* Phaser.js

## Backend

* Node.js
* Express
* TypeScript
* Socket.IO

## Data & Realtime Infrastructure

* PostgreSQL 17
* Prisma ORM
* Redis 7

## Security

* Argon2id
* SHA-256 session token hashing
* HTTP-only cookies
* Trusted-origin / custom-header CSRF protection
* Authentication rate limiting
* Credentialed CORS
* Server-side input validation

## Infrastructure

* Docker
* Docker Compose

---

# 📁 Repository Structure

```text
real-time-multiplayer-arena/
│
├── frontend/
│   └── src/
│       ├── app/
│       ├── components/
│       ├── game/
│       ├── hooks/
│       ├── lib/
│       ├── services/
│       └── types/
│
├── server/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── config/
│   │   ├── routes/
│   │   ├── socket/
│   │   ├── game/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── types/
│   │   └── utils/
│   └── test/
│
├── docs/
│   ├── architecture.md
│   └── verification.md
│
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .nvmrc
├── package.json
├── package-lock.json
└── README.md
```

---

# 🔐 Authentication

Phase 2 introduces first-party email/password authentication backed by PostgreSQL.

Players can:

* create an account
* log in
* restore an existing session
* log out
* access authenticated routes
* update their display name
* establish authenticated Socket.IO connections

Authentication tokens are never stored in browser-accessible storage.

---

# 🔑 Password Security

Passwords are hashed using **Argon2id** before being persisted.

Plaintext passwords are never stored.

Password hashes are never returned through account API responses.

---

# 🍪 Session Architecture

Authentication uses random opaque server-managed session tokens.

```text
Login / Registration
        │
        ▼
Generate cryptographically random token
        │
        ├──── Raw token ────► HTTP-only cookie
        │
        ▼
      SHA-256
        │
        ▼
Token Hash
        │
        ▼
PostgreSQL Session
```

Only the SHA-256 hash of the token is stored in PostgreSQL.

Sessions support:

* expiration
* rotation
* revocation
* logout invalidation
* authenticated REST requests
* authenticated Socket.IO connections

The raw token is not exposed to frontend JavaScript.

---

# 🗄️ Database Models

Phase 2 added three primary identity models.

## User

Stores core account identity including:

* unique email
* password hash
* creation timestamp
* update timestamp

## PlayerProfile

Stores player-facing identity including:

* unique username
* display name
* associated user
* creation/update timestamps

Each user has one player profile.

## Session

Stores server-side authentication sessions including:

* associated user
* session token hash
* expiration
* session metadata

Raw session tokens are never persisted.

Migration:

```text
20260908050000_player_accounts
```

---

# 🌐 Authentication API

### Register

```http
POST /api/auth/register
```

Creates:

```text
User
 ↓
PlayerProfile
 ↓
Session
 ↓
HTTP-only authentication cookie
```

---

### Login

```http
POST /api/auth/login
```

Validates credentials and establishes a new authenticated session.

Invalid credentials use safe generic responses.

---

### Current Player

```http
GET /api/auth/me
```

Returns safe account/profile information for the current authenticated player.

Sensitive authentication data is excluded.

---

### Logout

```http
POST /api/auth/logout
```

Revokes the server-side session and clears the authentication cookie.

---

### Update Profile

```http
PATCH /api/profile
```

Allows authenticated players to update supported profile information such as their display name.

All updates are validated server-side.

---

# 🛡️ Authentication Security

Phase 2 includes:

* Argon2id password hashing
* random opaque session tokens
* SHA-256 session token hashing
* HTTP-only cookies
* session expiration
* session rotation
* logout revocation
* server-side validation
* request body limits
* login/register rate limiting
* credentialed CORS
* trusted frontend origin validation
* custom-header/origin CSRF protection
* sanitized authentication errors
* protected REST endpoints

Authentication tokens are not stored in:

```text
localStorage
sessionStorage
client-readable cookies
```

---

# 🔌 Authenticated Socket.IO

Socket.IO now uses the same authentication system as the REST API.

During the connection handshake:

```text
Browser
   │
   │ HTTP-only session cookie
   ▼
Socket.IO Server
   │
   ▼
Session validation
   │
   ▼
PostgreSQL
   │
   ▼
Resolved Player Identity
```

The server resolves identity itself.

The browser cannot authenticate by simply submitting a user ID or username.

Authenticated socket context contains safe player identity information.

Unauthenticated Socket.IO connections are rejected.

Revoked sessions can no longer maintain authenticated game connections.

The original:

```text
system:ping → system:pong
```

flow remains operational.

---

# 🖥️ Frontend

## Public Routes

```text
/
/login
/register
/leaderboard
```

## Protected Routes

```text
/dashboard
/profile
/play
```

Unauthenticated users attempting to access protected pages are redirected to login.

Authenticated users opening login/register are redirected appropriately.

---

# 📝 Registration

The registration page supports:

* email
* username
* display name
* password
* password confirmation
* validation feedback
* loading states
* accessible form controls
* responsive layout

Successful registration establishes a session and redirects the player to the dashboard.

---

# 🔓 Login

The login interface provides:

* email/password authentication
* loading state
* safe credential errors
* session establishment
* automatic authentication-state update
* dashboard redirect

---

# 📊 Player Dashboard

Authenticated players can access their dashboard.

Current information includes:

* display name
* username
* email
* account creation information
* player/account status

Future competitive statistics are represented as unavailable rather than fabricated.

Future dashboard systems will include:

* matches played
* wins
* eliminations
* rating

---

# 👤 Player Profile

The profile page displays player identity and account information.

Players can currently edit supported profile fields such as their display name.

All changes are validated by the server.

Avatar storage and advanced profile customization are deferred.

---

# 🧭 Navigation

Navigation responds to authentication state.

### Logged Out

```text
Login
Create Account
```

### Logged In

```text
Dashboard
Play
Profile
Logout
```

Player identity is displayed where appropriate.

---

# 🎮 Phaser

Phaser remains integrated through a client-only architecture.

The integration:

* avoids SSR conflicts
* prevents duplicate instances
* destroys instances when unmounted
* supports clean remounting
* keeps Phaser logic separated from React

Full multiplayer gameplay begins in later phases.

---

# ❤️ Health API

```http
GET /api/health
```

Local endpoint:

```text
http://localhost:4000/api/health
```

---

# 🐳 Local Infrastructure

Docker Compose provides:

```text
PostgreSQL 17 → localhost:5433
Redis 7       → localhost:6380
```

Both infrastructure services were connectivity-tested during Phase 2.

PostgreSQL migrations and real Prisma queries completed successfully.

Redis successfully returned:

```text
PONG
```

and the application reported Redis as ready.

---

# ⚙️ Local Development

## Requirements

* Node.js 24
* npm
* Docker
* Docker Compose

Install dependencies:

```bash
npm ci
```

<<<<<<< HEAD
Start infrastructure:
=======
If local environment files already exist, preserve them and add only missing variables. Choose a local PostgreSQL password in root `.env`, and use the same URL-encoded password in both database URLs in `server/.env`. Template credentials are examples only. Keep all real environment files out of Git.
>>>>>>> 0dfc352 (Add player authentication and profiles)

```bash
docker compose up -d
<<<<<<< HEAD
```

Apply database migrations:

```bash
npm run db:migrate -w server
```

Start the game server:

```bash
npm run dev:server
```

Then open another terminal:
=======
npm run db:generate -w server
npm run db:migrate -w server
npm run dev:server
```

In another terminal:
>>>>>>> 0dfc352 (Add player authentication and profiles)

```bash
npm run dev:frontend
```

<<<<<<< HEAD
Frontend:

```text
http://localhost:3000
```

Backend:

```text
http://localhost:4000
```

Health:

```text
http://localhost:4000/api/health
```

---

# 🧪 Verification

Phase 2 verification passed successfully.

```text
Backend Tests
24 passed
0 failed
0 skipped
```

This includes the three original Phase 1 foundation tests and 21 additional tests.

Coverage includes:

* registration
* duplicate accounts
* input validation
* login
* invalid credentials
* session restoration
* logout
* protected APIs
* invalid sessions
* profile updates
* authenticated Socket.IO
* unauthenticated Socket.IO rejection
* sensitive-data protection

Additional verification passed for:

* frontend lint
* server lint
* TypeScript checks
* Prisma validation
* frontend production build
* server production build
* PostgreSQL connectivity
* Redis connectivity
* database migrations
* browser registration
* browser login
* profile editing
* protected redirects
* session restoration
* cross-tab logout
* Socket.IO authentication
* mobile behavior

No session tokens or password hashes were exposed in account responses or browser storage.

---

# ⚠️ Known Limitations

Currently deferred:

* email verification
* password recovery
* OAuth
* MFA
* multiplayer rooms
* matchmaking
* gameplay synchronization
* combat
* match persistence
* competitive statistics
* leaderboards
* reconnection
* spectators
* AI bots
* production deployment

Authentication rate limiting is currently process-local.

Four existing Prisma transitive dependency advisories remain and should be reviewed before production deployment.

---

# 🗺️ Development Roadmap

## Phase 1 — Foundation & Architecture ✅

* Next.js frontend
* Express backend
* Phaser
* Socket.IO
* PostgreSQL
* Prisma
* Redis
* Docker

## Phase 2 — Player Accounts & Authentication ✅

* User accounts
* Player profiles
* PostgreSQL sessions
* Argon2id password hashing
* HTTP-only authentication
* Protected routes
* Profile editing
* Authenticated Socket.IO
* Authentication security

## Phase 3 — Multiplayer Rooms

Planned:

* room creation
* room browser
* room joining/leaving
* private room codes
* room host
* player readiness
* room lifecycle
* realtime room updates

## Phase 4 — Real-Time Arena

Planned:

* arena scene
* player spawning
* movement
* server-authoritative positioning
* state synchronization
* interpolation

## Phase 5 — Combat

Planned:

* attacks
* projectiles
* health
* damage
* eliminations
* respawning

## Phase 6 — Match System

Planned:

* match lifecycle
* timers
* scoring
* results
* persistent match records

## Phase 7 — Matchmaking

Planned:

* Redis queue
* automated matching
* room assignment
* matchmaking rating foundations

## Phase 8 — Competitive Systems

Planned:

* statistics
* leaderboards
* match history
* player performance

## Phase 9 — Advanced Multiplayer

Planned:

* reconnection
* spectators
* AI bots
* presence
* network resilience

## Phase 10 — Production Deployment

Target:

```text
Frontend       → Vercel
Game Server    → Railway
PostgreSQL     → Supabase / Neon
Redis          → Upstash Redis
```

---

# 🎯 Engineering Goals

This project is designed to demonstrate practical experience with:

* real-time multiplayer networking
* WebSockets
* authoritative game servers
* Phaser
* Next.js
* full-stack TypeScript
* secure authentication
* password security
* session management
* PostgreSQL
* Prisma
* Redis
* Docker
* realtime state synchronization
* scalable backend architecture

---

## 📊 Current Status

```text
Phase 2/10

Foundation & Architecture     ██████████ 100%
Authentication & Profiles     ██████████ 100%
Multiplayer Rooms             ░░░░░░░░░░   0%
Real-Time Arena               ░░░░░░░░░░   0%
Combat                        ░░░░░░░░░░   0%
Match System                  ░░░░░░░░░░   0%
Matchmaking                   ░░░░░░░░░░   0%
Competitive Systems           ░░░░░░░░░░   0%
Advanced Multiplayer          ░░░░░░░░░░   0%
Production Deployment         ░░░░░░░░░░   0%
```

---

Built as a full-stack real-time multiplayer engineering project.
=======
Open [localhost:3000](http://localhost:3000), create an account, and visit the dashboard/profile/play preview. The backend is [localhost:4000](http://localhost:4000/api/health). Frontend/server workspace scripts load the correct application environment; root `.env` is only for Compose. Dev, typecheck, tests, and server build regenerate Prisma Client automatically.

## Database and Redis

Compose binds PostgreSQL 17 to `127.0.0.1:5433` and Redis 7 to `127.0.0.1:6380`, with health checks and persistent volumes. PostgreSQL is required for account operations. Redis is optional and not used to store authentication sessions.

```sh
docker compose ps
docker compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec -T redis redis-cli ping
npm run db:validate
```

The initial migration is `20260908050000_player_accounts`. It creates User, PlayerProfile, and Session with unique constraints, indexes, and cascading relations. `db:migrate` applies existing migrations without resetting data. For future schema development, use `npm run db:migrate:dev -w server -- --name your_change`, review SQL, then regenerate the client. Never reset a production database as a development workflow.

`docker compose down` stops infrastructure while retaining data. `docker compose down -v` deletes local PostgreSQL/Redis data. Ports can be changed in root `.env`; update server connection URLs accordingly.

## Environment variables

| Location | Variable | Purpose |
| --- | --- | --- |
| frontend/.env.local | NEXT_PUBLIC_API_URL | REST origin, local http://localhost:4000 |
| frontend/.env.local | NEXT_PUBLIC_SOCKET_URL | Socket.IO origin, local http://localhost:4000 |
| server/.env | NODE_ENV | development, test, production |
| server/.env | PORT | Backend port, default 4000 |
| server/.env | FRONTEND_URL | Exact trusted HTTP(S) origin with no trailing slash; HTTPS required in production |
| server/.env | DATABASE_URL | PostgreSQL application database URL |
| server/.env | TEST_DATABASE_URL | Separate disposable database ending in `_test`; required for backend tests |
| server/.env | REDIS_URL | Optional redis:// or rediss:// URL; leave blank to disable |
| server/.env | SESSION_TTL | Absolute session lifetime in seconds; default 604800 (7 days), range 300–2592000 |
| server/.env | SESSION_COOKIE_NAME | Local template: arena_session; production: __Host-arena_session |
| server/.env | COOKIE_SECURE | Local false; production must be true (production default is true if unset) |
| server/.env | COOKIE_SAME_SITE | lax (default), strict, or none; none requires Secure |
| server/.env | TRUST_PROXY_HOPS | Exact reverse-proxy hop count; default 0, do not blindly trust forwarded headers |
| .env | POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB | Local infrastructure credentials/name |
| .env | POSTGRES_PORT / REDIS_PORT | Host ports, defaults 5433 / 6380 |

No SESSION_SECRET is needed for random opaque database sessions. Public variables are build-time values and must not contain secrets. Do not copy development cookie settings into production unchanged. Prefer same-site custom frontend/API domains: unrelated Vercel/Railway default domains need SameSite=None + Secure and may be blocked by browser third-party-cookie policies.

## Endpoints and session behavior

| Endpoint | Access | Behavior |
| --- | --- | --- |
| GET /api/health | Public | Liveness and dependency configuration/Redis state |
| POST /api/auth/register | Public, origin checked, rate limited | Creates account/profile/session; returns safe player (201) |
| POST /api/auth/login | Public, origin checked, rate limited | Verifies credentials; issues fresh session (200) |
| GET /api/auth/me | Authenticated | Returns safe current player (200), otherwise 401 |
| POST /api/auth/logout | Origin checked, repeatable | Revokes current session, clears cookie (204) |
| PATCH /api/profile | Authenticated, origin checked | Updates displayName only (200) |

Every state-changing request requires `Content-Type: application/json`, exact `Origin: FRONTEND_URL`, and `X-Arena-Request: 1`. The frontend API service supplies these (the browser supplies Origin). For manual API clients include those headers explicitly and use a cookie jar; do not place passwords/tokens in URLs or commit them.

Passwords are Argon2id hashes with random salts. Tokens are 32 secure random bytes; PostgreSQL stores only SHA-256 token hashes. Raw tokens appear only in HttpOnly Set-Cookie. Password/token hashes are excluded from JSON. Authentication expires after the configured absolute TTL. Login rotates the presented browser session; logout revokes it. Startup/hourly cleanup removes expired database sessions without per-request lastSeen writes. API errors are safe, body size is limited to 16 KiB, and login/register share a 20-attempt/15-minute per-IP limit.

`/dashboard`, `/profile`, and `/play` redirect unauthenticated browsers to `/login`. Public landing/login/register stay accessible. Dashboard statistics are explicitly unavailable. Navigation switches between Login/Create Account and Dashboard/Play/Profile/Logout with the display name.

Socket.IO uses the same cookie-backed identity. The server rejects missing/invalid sessions and untrusted handshake origins, ignores client identity claims, and stores safe typed socket identity. `system:ping` produces `system:pong` with socketId/timestamp only for valid sessions. Logout/rotation disconnects affected sockets; ongoing sessions are rechecked on pings and every 30 seconds while idle. The `/play` UI verifies this connection without introducing gameplay.

## Tests and verification

Create the dedicated test database once:

```sh
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" arena_test'
```

If it already exists, reuse it; do not drop unrelated databases. Set TEST_DATABASE_URL in server/.env, matching its credentials and port. Tests refuse a missing URL or a database name without `_test`, apply migrations to random schemas, and clean up only their generated schemas.

```sh
npm test
npm run lint
npm run typecheck
npm run db:validate
npm run build
docker compose config --quiet
```

`npm test` passes **24 tests** covering all account/session/profile flows, safety boundaries, real database persistence and rollback, authenticated sockets and rejection, plus the three Phase 1 foundation tests. [Verification details](docs/verification.md) include browser checks and known dependency advisories.

To run built applications, build first and then use separate terminals:

```sh
npm run start -w server
npm run start -w frontend
```

## Deferred work and limitations

No rooms, matchmaking, movement, combat, health/respawn, power-ups, matches, leaderboards, statistics, reconnect gameplay, spectators, or bots are implemented. Those remain future phases. Email verification, password reset, OAuth/MFA, username/email changes, avatar uploads, and session-management UI are also deferred.

The IP limiter and immediate socket revocation notifications are process-local; shared controls are needed before multi-instance deployment. Database readiness is not part of the liveness endpoint. Four transitive Prisma toolchain advisories remain from Phase 1; see verification for scope and required production follow-up. No deployment or Git commit/push was performed.
>>>>>>> 0dfc352 (Add player authentication and profiles)
