# 🎮 Real-Time Multiplayer Arena

A server-authoritative browser multiplayer arena built with **Next.js, Phaser, Node.js, Socket.IO, PostgreSQL, Prisma, and Redis**.

Players can securely create accounts, create or join multiplayer rooms, ready up, launch a match, and move around a synchronized Phaser arena in real time.

> **Current Status: Phase 4 — Real-Time Arena & Authoritative Movement ✅**

---

## 🎯 Project Overview

Real-Time Multiplayer Arena is a full-stack multiplayer engineering project focused on real-time networking and authoritative game-server architecture.

The client sends **player input**, not trusted coordinates. The game server simulates canonical player positions and broadcasts snapshots back to connected clients.

```text
Player Input
     │
     ▼
Phaser Client
     │
     │ Socket.IO
     ▼
Authoritative Game Server
     │
     ├── Validate Input
     ├── Simulate Movement
     ├── Enforce Boundaries
     └── Generate Snapshots
              │
              ▼
        Connected Clients
              │
        ┌─────┴─────┐
        ▼           ▼
   Prediction   Interpolation
```

---

# ✨ Current Features

## Authentication

* Secure registration and login
* Argon2id password hashing
* HTTP-only sessions
* PostgreSQL-backed session management
* Player profiles
* Protected routes
* Authenticated Socket.IO

## Multiplayer Lobby

* Public rooms
* Private rooms
* Shareable room codes
* Public room discovery
* Capacity enforcement
* One room per player
* Ready states
* Host controls
* Automatic host transfer
* Reconnect grace period
* Redis-backed room metadata

## Real-Time Arena

* Phaser 2D arena
* Multiple synchronized players
* Server-authoritative movement
* WASD controls
* Arrow-key controls
* Normalized diagonal movement
* Server-enforced boundaries
* Client-side prediction
* Server reconciliation
* Pending-input replay
* Remote-player interpolation
* Smooth camera follow
* Player labels
* Arena HUD
* Network diagnostics
* Refresh recovery
* Disconnect recovery

---

# 🧰 Tech Stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* Phaser.js
* Socket.IO Client

### Backend

* Node.js
* Express
* TypeScript
* Socket.IO

### Data

* PostgreSQL 17
* Prisma ORM
* Redis 7

### Security

* Argon2id
* SHA-256 session-token hashing
* HTTP-only cookies
* server-managed sessions
* trusted-origin protection
* CORS
* payload validation
* rate limiting

### Infrastructure

* Docker
* Docker Compose

---

# 🏗️ Architecture

```text
                  ┌─────────────────────────┐
                  │      Web Browser        │
                  │                         │
                  │ Next.js + React         │
                  │ Phaser Game Client      │
                  └────────────┬────────────┘
                               │
                       REST + Socket.IO
                               │
                               ▼
                  ┌─────────────────────────┐
                  │ Authoritative Game      │
                  │ Server                  │
                  │                         │
                  │ Node.js + Express       │
                  │ Socket.IO               │
                  │ GameManager             │
                  │ GameInstance            │
                  └───────┬─────────┬───────┘
                          │         │
                          ▼         ▼
                   PostgreSQL     Redis
                   + Prisma
```

### PostgreSQL

Stores durable application data:

* users
* profiles
* sessions

### Redis

Stores ephemeral multiplayer metadata:

* rooms
* memberships
* room codes
* readiness
* host ownership
* room status
* game identifiers

### Game-Server Memory

Stores high-frequency active gameplay state:

* positions
* movement input
* input sequence numbers
* connection state
* active simulation state

Player positions are deliberately **not written to PostgreSQL or Redis every tick**.

---

# 🔐 Authentication Architecture

Authentication uses random opaque session tokens.

```text
Login
  │
  ▼
Random Session Token
  │
  ├──── Raw token ────► HTTP-only Cookie
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

Passwords use **Argon2id**.

Socket.IO uses the same authenticated session as the REST API.

Clients cannot prove identity by submitting a user ID or username.

---

# 🏠 Multiplayer Rooms

Players access the multiplayer experience through:

```text
/play
```

Players can:

* create public rooms
* create private rooms
* browse public rooms
* join rooms
* enter private room codes
* ready up
* start matches
* leave rooms

Private rooms are excluded from public discovery.

---

# 👑 Room Host

The creator initially becomes host.

If the host leaves before a match, ownership transfers to the earliest-joined remaining player.

Once gameplay begins, simulation authority belongs to the **server**, not the room host.

---

# ✅ Match Start

All players, including the host, must be ready.

Only the host can initiate the match.

```text
WAITING
   │
   ▼
STARTING
   │
   ▼
IN_GAME
```

The server:

1. validates host authority
2. verifies player count
3. verifies readiness
4. generates a match ID
5. creates the authoritative game instance
6. assigns spawn locations
7. transitions players into the Phaser arena

---

# 🎮 Phaser Arena

Current world dimensions:

```text
1600 × 900
```

The arena uses original procedural graphics rather than external copyrighted game assets.

It includes:

* dark arena styling
* floor/grid treatment
* visible boundaries
* player markers
* player names
* local-player identification
* bounded camera

---

# 🕹️ Controls

Move with:

```text
W A S D
```

or:

```text
Arrow Keys
```

Diagonal movement is normalized.

Current authoritative movement speed:

```text
260 units / second
```

The client cannot choose its own movement speed.

---

# 🖥️ Server Simulation

Gameplay uses a fixed authoritative simulation loop.

```text
Simulation Rate: 20 Hz
Snapshot Rate:   10 Hz
```

The simulation is independent of browser frame rate.

One game-server process can manage multiple active game instances through the shared simulation architecture.

The simulation loop does not perform PostgreSQL or Redis writes every tick.

---

# 📡 Movement Protocol

Clients send **movement intent**, not positions.

Conceptually:

```text
{
  up,
  down,
  left,
  right,
  sequence
}
```

The server determines:

```text
position
speed
movement delta
boundary enforcement
processed input sequence
```

Clients cannot submit authoritative coordinates.

---

# ⚡ Client-Side Prediction

Waiting for every server snapshot before moving the local character would make controls feel delayed.

The local Phaser client therefore predicts movement immediately.

```text
Keyboard Input
     │
     ├──────────────► Local Prediction
     │
     ▼
Game Server
     │
     ▼
Authoritative Position
```

The server remains authoritative.

---

# 🔄 Server Reconciliation

Movement inputs use increasing sequence numbers.

The server acknowledges processed inputs through authoritative snapshots.

When the client receives a snapshot:

1. use authoritative server position
2. remove acknowledged inputs
3. replay pending inputs
4. correct prediction error

This allows responsive controls without trusting the browser as the source of truth.

---

# 🌐 Remote Player Interpolation

Remote players are rendered using buffered interpolation rather than directly snapping to each incoming position.

Current interpolation delay:

```text
120 ms
```

Conceptually:

```text
Snapshot A             Snapshot B
    ●----------------------●
              ↑
       interpolated
          position
```

This produces smoother remote movement despite snapshots arriving at 10 Hz.

---

# 📷 Camera

The Phaser camera:

* follows the local player
* moves smoothly
* respects world boundaries
* responds to viewport resizing

Gameplay coordinates remain based on the logical world rather than browser dimensions.

---

# 📊 Arena HUD

The arena interface currently displays information such as:

* room/match identity
* player count
* connection state
* movement controls
* Leave Arena

A development network diagnostics overlay is available but disabled by default.

Diagnostics can expose useful non-sensitive information such as:

* socket state
* server tick
* snapshot activity
* latency
* predicted position
* authoritative position

---

# 🔄 Disconnect & Recovery

Temporary connection loss uses a:

```text
5-second reconnect grace period
```

During the grace period the disconnected player's movement is frozen.

If the player reconnects in time:

* identity is restored
* current game membership is restored
* authoritative position is retained
* Phaser is reconstructed safely

Refreshing `/play` therefore does not automatically respawn the player.

---

# 🖥️ Multiple Tabs

Only the newest active game/lobby controller may control a player.

Older connections stop controlling gameplay.

This prevents multiple browser tabs from simultaneously submitting movement for the same authenticated player.

---

# 🛡️ Anti-Cheat Foundation

The authoritative architecture prevents clients from directly:

* submitting positions
* choosing movement speed
* moving another player
* spoofing player identity
* controlling a game they do not belong to
* moving before the match begins
* continuing control after removal
* manipulating the server simulation tick

This provides an anti-cheat foundation rather than a complete anti-cheat system.

---

# 🧪 Testing

Phase 4 verification:

```text
Backend tests:      80
Networking tests:    6
-----------------------
Total:              86

Failed:              0
```

All previous applicable tests remain covered.

Testing includes:

* room-to-game transition
* authoritative spawning
* movement processing
* movement speed
* diagonal normalization
* world boundaries
* malformed input
* unauthorized input
* sequence processing
* snapshots
* player leaving
* reconnect grace
* refresh recovery
* controller ownership
* game cleanup
* prediction
* reconciliation
* interpolation

---

# 🌐 Multiplayer Browser Verification

Two authenticated browser sessions were used for end-to-end multiplayer verification.

Verified:

* room creation
* second player joining
* ready states
* match start
* both clients entering Phaser
* Player A movement visible to Player B
* Player B movement visible to Player A
* equal cardinal/diagonal speed
* world boundaries
* refresh recovery
* leaving the arena
* mobile/tablet behavior
* browser console health

---

# ⚙️ Local Development

Start infrastructure:

```bash
docker compose up -d
```

Apply migrations:

```bash
npm run db:migrate -w server
```

Start the server:

```bash
npm run dev:server
```

In another terminal:

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

Multiplayer:

```text
http://localhost:3000/play
```

### Current-machine Node runtime

If required on the current development machine:

```bash
export PATH=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

---

# ⚠️ Current Limitations

Current live simulation supports a **single game-server process**.

Not yet implemented:

* combat
* weapons
* projectiles
* health
* damage
* eliminations
* respawning
* scoring
* match timer
* win conditions
* durable match recovery
* matchmaking
* persistent statistics
* competitive leaderboard data
* spectators
* AI bots
* touch movement controls
* multi-server live simulation

Packet loss or significant latency can still result in visible reconciliation corrections.

Existing Prisma dependency findings remain documented.

---

# 🗺️ Roadmap

### Phase 1 — Foundation & Architecture ✅

* Next.js
* Express
* Socket.IO
* Phaser foundation
* PostgreSQL
* Redis
* Docker

### Phase 2 — Authentication & Profiles ✅

* accounts
* profiles
* secure sessions
* protected routes
* authenticated sockets

### Phase 3 — Multiplayer Rooms ✅

* public/private rooms
* room codes
* Redis state
* host system
* readiness
* realtime lobby
* reconnect grace

### Phase 4 — Real-Time Arena ✅

* Phaser arena
* server-authoritative simulation
* spawning
* movement
* prediction
* reconciliation
* interpolation
* snapshots
* camera
* refresh recovery

### Phase 5 — Combat

Planned:

* player health
* aiming
* attacks
* projectiles
* server-authoritative damage
* eliminations
* respawning
* combat HUD

### Phase 6 — Match System

Planned:

* match timer
* scoring
* win conditions
* results
* persistent match records

### Phase 7 — Matchmaking

Planned:

* Redis matchmaking queue
* automated matching
* rating foundations

### Phase 8 — Competitive Systems

Planned:

* player statistics
* match history
* leaderboards
* performance analytics

### Phase 9 — Advanced Multiplayer

Planned:

* durable reconnection
* spectators
* AI bots
* presence improvements
* network resilience
* multi-instance foundations

### Phase 10 — Production Deployment

Target:

```text
Frontend       → Vercel
Game Server    → Railway
PostgreSQL     → Supabase / Neon
Redis          → Upstash Redis
```

---

# 🎯 Engineering Focus

This project demonstrates practical experience with:

* real-time multiplayer networking
* authoritative game-server architecture
* Socket.IO
* server simulation loops
* state snapshots
* client-side prediction
* server reconciliation
* remote interpolation
* Phaser
* full-stack TypeScript
* Redis
* PostgreSQL
* Prisma
* secure authentication
* concurrency
* Docker
* anti-cheat architecture

---

# 📊 Current Status

```text
Phase 4/10

Foundation & Architecture     ██████████ 100%
Authentication & Profiles     ██████████ 100%
Multiplayer Rooms             ██████████ 100%
Real-Time Arena               ██████████ 100%
Combat                        ░░░░░░░░░░   0%
Match System                  ░░░░░░░░░░   0%
Matchmaking                   ░░░░░░░░░░   0%
Competitive Systems           ░░░░░░░░░░   0%
Advanced Multiplayer          ░░░░░░░░░░   0%
Production Deployment         ░░░░░░░░░░   0%
```

---

Built as a full-stack real-time multiplayer engineering project.
