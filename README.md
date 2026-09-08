# 🎮 Real-Time Multiplayer Arena

A production-oriented browser-based multiplayer arena game built with **Next.js, Phaser, Node.js, Socket.IO, PostgreSQL, Prisma, and Redis**.

The project is being developed incrementally with a focus on secure player identity, authoritative multiplayer systems, real-time networking, concurrency-safe room management, scalable infrastructure, and modern full-stack engineering.

> **Current Status:** Phase 3 — Real-Time Multiplayer Rooms & Lobby ✅

---

## 📌 Project Overview

Real-Time Multiplayer Arena is a browser-based multiplayer game where authenticated players can create and join live rooms, interact through real-time Socket.IO connections, and prepare for multiplayer arena matches.

The project uses an authoritative backend so clients cannot directly control sensitive multiplayer state.

```text
Browser
   │
   ▼
Next.js + React
   │
   ├── REST
   └── Socket.IO
          │
          ▼
Node.js + Express Game Server
          │
          ├── PostgreSQL + Prisma
          └── Redis
```

Future gameplay will use Phaser while the Node.js server remains authoritative over game state.

---

# ✨ Current Features

## Player Identity

* Secure registration
* Login/logout
* PostgreSQL sessions
* Argon2id password hashing
* HTTP-only authentication cookies
* Player profiles
* Protected routes
* Authenticated Socket.IO connections

## Multiplayer Rooms

* Create public rooms
* Create private rooms
* Join public rooms
* Join private rooms using room codes
* Public room browser
* Maximum-player limits
* One active room per player
* Live room state
* Player ready states
* Host ownership
* Automatic host transfer
* Reconnect grace period
* Live player join/leave updates
* Room command rate limiting

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

## Database

* PostgreSQL 17
* Prisma ORM

## Real-Time Infrastructure

* Socket.IO
* Redis 7

## Security

* Argon2id
* SHA-256 session token hashing
* HTTP-only cookies
* server-managed sessions
* trusted-origin protection
* payload validation
* rate limiting
* credentialed CORS

## Infrastructure

* Docker
* Docker Compose

---

# 🏗️ Architecture

```text
                    ┌───────────────────┐
                    │      Browser      │
                    │ Next.js + React   │
                    └─────────┬─────────┘
                              │
                   REST + Socket.IO
                              │
                              ▼
                    ┌───────────────────┐
                    │ Node.js Game      │
                    │ Server            │
                    │ Express/Socket.IO │
                    └─────────┬─────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
        ┌──────────────────┐    ┌──────────────────┐
        │ PostgreSQL       │    │ Redis            │
        │                  │    │                  │
        │ Accounts         │    │ Rooms            │
        │ Profiles         │    │ Membership       │
        │ Sessions         │    │ Ready State      │
        └──────────────────┘    │ Host Ownership   │
                                └──────────────────┘
```

PostgreSQL handles persistent identity data.

Redis handles ephemeral realtime lobby state.

---

# 🔐 Authentication

Authentication uses server-managed opaque sessions.

```text
Registration / Login
        │
        ▼
Random Session Token
        │
        ├── Raw token → HTTP-only cookie
        │
        ▼
      SHA-256
        │
        ▼
Session Token Hash
        │
        ▼
PostgreSQL
```

Passwords are protected with **Argon2id**.

Raw session tokens are never persisted.

Authentication tokens are not stored in:

```text
localStorage
sessionStorage
client-readable cookies
```

---

# 🗄️ PostgreSQL Models

Current core models:

## User

Stores:

* unique email
* password hash
* timestamps

## PlayerProfile

Stores:

* unique username
* display name
* account relationship

## Session

Stores:

* hashed session token
* associated user
* expiration
* session state

Phase 3 required **no PostgreSQL schema changes or migrations**.

---

# ⚡ Redis Room Architecture

Phase 3 introduces Redis-backed multiplayer room state.

Redis tracks ephemeral data such as:

* rooms
* memberships
* room-code lookup
* ready state
* host ownership
* player-to-room association

Room information is stored under a namespaced snapshot architecture.

Room mutations are serialized and persisted atomically to prevent obvious concurrency problems.

This protects cases such as two players attempting to take the final room slot at the same time.

Redis state includes cleanup behavior using:

* TTL
* room deletion
* membership cleanup
* server shutdown cleanup

Rooms currently do not survive a full game-server restart.

---

# 🎮 Multiplayer Lobby

Authenticated players can access:

```text
/play
```

The page now acts as the multiplayer lobby.

Players can:

* browse public rooms
* create public rooms
* create private rooms
* join public rooms
* enter a private room code
* view connection status
* join a realtime lobby

Phaser gameplay is intentionally not loaded yet.

---

# 🏠 Creating Rooms

Players can create rooms with:

* room name
* visibility
* maximum players

Supported visibility:

```text
PUBLIC
PRIVATE
```

Rooms receive a randomly generated human-friendly room code.

Example:

```text
K7M4PX
```

The creator automatically becomes:

* first member
* room host

A player cannot belong to multiple rooms simultaneously.

---

# 🌍 Public Rooms

Public rooms appear in the room browser.

Safe room information includes:

* room name
* host
* current player count
* maximum players
* room status
* join availability

Private rooms are excluded from public discovery.

---

# 🔒 Private Rooms

Private rooms can be joined using their room code.

Private room information is not leaked through the public room browser.

Room-code input is normalized and validated by the server.

---

# 👥 Room State

Each room maintains authoritative information including:

* room ID
* room code
* name
* visibility
* status
* host
* maximum players
* creation time
* players

Player room information includes:

* player profile ID
* username
* display name
* ready state
* host status
* join order/time

Sensitive information such as email addresses, session information, password hashes, and Redis internals are never exposed through room state.

---

# 👑 Host System

The room creator initially becomes host.

If the host leaves, host ownership automatically transfers.

The new host is:

> The earliest-joined remaining player.

This deterministic rule prevents clients from deciding host ownership themselves.

---

# ✅ Ready System

Each player has a server-authoritative ready state.

Players can toggle:

```text
READY
NOT READY
```

All players, including the host, must be ready before the room can start.

Ready-state changes are immediately synchronized to other connected players.

Clients cannot modify another player's readiness.

---

# 🚀 Start Validation

Only the room host can request a start.

The server validates:

* caller is the host
* enough players are present
* every player is ready
* room is currently waiting

When valid:

```text
WAITING
   ↓
STARTING
   ↓
Ready confirmation
   ↓
WAITING
```

The room currently remains in `STARTING` for approximately two seconds before returning to `WAITING`.

This Phase 3 transition verifies that the room is ready to launch without starting actual gameplay.

Phase 4 will replace this placeholder behavior with the real Phaser arena transition.

---

# 🔌 Socket.IO Room Protocol

Phase 3 added typed realtime room commands.

Client → Server:

```text
rooms:list
room:sync
room:create
room:join
room:join-code
room:leave
room:set-ready
room:start
```

Socket connections remain authenticated using the player's server-side session.

The server never trusts a client-provided user ID or username as authentication.

---

# 🔄 Reconnect Handling

Temporary transport interruptions receive a:

```text
5-second grace period
```

This allows short network interruptions or page reconnects without instantly removing the player from the room.

If the player reconnects within the grace period, their room can be restored.

Explicit actions such as:

* Leave Room
* Logout

remove membership immediately.

Opening another lobby tab replaces the previous active lobby controller.

Full in-match reconnection is deferred to a later phase.

---

# ⚔️ Concurrency Protection

Room state changes are server-controlled.

Serialized commands and atomic Redis writes protect against race conditions such as:

* simultaneous final-slot joins
* duplicate joins
* duplicate leave requests
* repeated ready changes
* concurrent room modifications
* repeated start requests

The server remains the source of truth.

---

# 🛡️ Multiplayer Security

Room commands require authenticated Socket.IO connections.

Phase 3 includes protection against:

* player impersonation
* private-room information leakage
* invalid payloads
* oversized/invalid values
* multiple-room membership
* room-capacity bypass
* unauthorized ready changes
* unauthorized host actions
* excessive room-command spam

Player identity always comes from the authenticated server-side socket context.

---

# 🧭 Room UI

After joining a room, the player can see:

* room name
* room code
* copy-code control
* room visibility
* room status
* player count
* host
* roster
* ready states
* current player indicator
* connection status

Controls include:

* Ready / Not Ready
* Leave Room
* Start Match

Host-only actions appear only for the host.

Start controls explain when readiness requirements are not satisfied.

---

# 📡 Realtime UI Updates

Room state updates automatically when:

* a player joins
* a player leaves
* host ownership changes
* readiness changes
* room status changes

Manual browser refresh is not required for normal lobby updates.

Socket listeners are centrally managed to avoid duplicated realtime connections.

---

# 🧪 Verification

Phase 3 verification completed successfully.

```text
55 tests passed
0 failed
0 skipped
```

This includes:

```text
24 existing tests
31 new multiplayer-room tests
```

Coverage includes:

* authenticated room creation
* public/private room behavior
* room validation
* unique room codes
* room joining
* room capacity
* duplicate membership
* one-room enforcement
* room leaving
* host transfer
* empty-room cleanup
* ready-state changes
* host permissions
* start requirements
* disconnect handling
* reconnection grace period
* concurrent joins
* authenticated sockets
* safe payloads
* rate limiting

---

# 🌐 Browser Verification

Two authenticated browser sessions were used to verify multiplayer behavior.

Verified:

* public room creation
* public room discovery
* player joining
* realtime roster updates
* private-room creation
* private-room code joining
* readiness synchronization
* host start validation
* status reset
* reconnect/refresh recovery
* host transfer
* mobile layout

Frontend/server lint, TypeScript checks, Prisma validation, production builds, Redis cleanup, and infrastructure checks also passed.

---

# ⚙️ Local Development

## Requirements

* Node.js 24
* npm
* Docker
* Docker Compose

On the current development machine, use:

```bash
export PATH=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

Install dependencies:

```bash
npm ci
```

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Apply database migrations:

```bash
npm run db:migrate -w server
```

Start the backend:

```bash
npm run dev:server
```

Backend:

```text
http://localhost:4000
```

In another terminal:

```bash
export PATH=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH

npm run dev:frontend
```

Frontend:

```text
http://localhost:3000
```

Multiplayer lobby:

```text
http://localhost:3000/play
```

---

# ⚠️ Current Limitations

Current multiplayer architecture runs on:

```text
1 game-server instance
```

Room state does not survive a complete server restart.

The following remain intentionally deferred:

* Phaser arena gameplay
* realtime movement
* player physics
* combat
* health
* damage
* eliminations
* respawning
* power-ups
* persistent matches
* matchmaking
* statistics
* leaderboards
* spectators
* AI bots
* full match reconnection
* multi-server room coordination
* production deployment

Four existing Prisma transitive dependency advisories remain.

---

# 🗺️ Development Roadmap

## Phase 1 — Foundation & Architecture ✅

* Next.js
* Express
* Socket.IO
* Phaser foundation
* PostgreSQL
* Prisma
* Redis
* Docker

## Phase 2 — Accounts & Authentication ✅

* User accounts
* Player profiles
* secure sessions
* Argon2id
* protected routes
* authenticated Socket.IO

## Phase 3 — Multiplayer Rooms ✅

* public rooms
* private rooms
* room codes
* realtime room browser
* Redis-backed room state
* host ownership
* host transfer
* readiness
* reconnect grace period
* concurrency protection
* multiplayer lobby UI

## Phase 4 — Real-Time Arena

Planned:

* Phaser arena
* player entities
* spawning
* keyboard controls
* realtime movement
* authoritative server simulation
* movement validation
* snapshots
* interpolation
* latency-aware synchronization

## Phase 5 — Combat

Planned:

* attacks
* projectiles
* health
* damage
* deaths
* eliminations
* respawning

## Phase 6 — Match System

Planned:

* match lifecycle
* timer
* scoring
* win conditions
* match results
* persistent match records

## Phase 7 — Matchmaking

Planned:

* Redis matchmaking queue
* automated room assignment
* skill/rating foundations

## Phase 8 — Competitive Systems

Planned:

* statistics
* leaderboards
* match history
* performance tracking

## Phase 9 — Advanced Multiplayer

Planned:

* full reconnection
* spectators
* AI bots
* improved presence
* network resilience
* multi-instance foundations

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

This project demonstrates practical experience with:

* real-time multiplayer networking
* Socket.IO
* WebSockets
* authenticated realtime systems
* authoritative servers
* concurrency management
* Redis
* PostgreSQL
* Prisma
* secure authentication
* Next.js
* React
* TypeScript
* Phaser
* Docker
* realtime state synchronization
* distributed-system foundations

---

# 📊 Current Status

```text
Phase 3/10

Foundation & Architecture     ██████████ 100%
Authentication & Profiles     ██████████ 100%
Multiplayer Rooms             ██████████ 100%
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
