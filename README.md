# 🎮 Real-Time Multiplayer Arena

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

---

# ✨ Planned Features

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

Start infrastructure:

```bash
docker compose up -d
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

```bash
npm run dev:frontend
```

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
