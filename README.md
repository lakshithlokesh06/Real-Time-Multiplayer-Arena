# 🎮 Real-Time Multiplayer Arena

A server-authoritative browser multiplayer arena built with **Next.js, Phaser, Node.js, Socket.IO, PostgreSQL, Prisma, and Redis**.

Players can securely create accounts, join multiplayer rooms, enter a synchronized Phaser arena, move in real time, aim, fire projectiles, deal damage, eliminate opponents, and respawn.

> **Current Status: Phase 5 — Server-Authoritative Combat ✅**

---

## 📌 Project Overview

Real-Time Multiplayer Arena is a full-stack multiplayer engineering project focused on real-time networking, authoritative simulation, secure player identity, synchronized gameplay, and anti-cheat-oriented server design.

The browser sends player intent.

The server decides the authoritative result.

```text
Input
  │
  ▼
Phaser Client
  │
  │ Socket.IO
  ▼
Authoritative Game Server
  │
  ├── Movement Validation
  ├── Projectile Creation
  ├── Collision Detection
  ├── Damage
  ├── Eliminations
  └── Respawning
         │
         ▼
Authoritative Snapshots
         │
         ▼
Connected Clients
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
* Room discovery
* Ready states
* Host controls
* Automatic host transfer
* Reconnect grace period
* Redis-backed room metadata

## Real-Time Arena

* Phaser 2D arena
* Multiple synchronized players
* Server-authoritative movement
* WASD / arrow-key controls
* Client-side prediction
* Server reconciliation
* Remote interpolation
* Server-enforced boundaries
* Smooth camera
* Refresh recovery

## Combat

* Mouse aiming
* Basic Blaster
* Server-authoritative shooting
* Projectiles
* Swept collision detection
* Health
* Damage
* Eliminations
* Death state
* Respawning
* Live elimination/death counters
* Health bars
* Hit feedback
* Respawn countdown
* Projectile rendering
* Combat HUD

---

# 🧰 Tech Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* Phaser.js
* Socket.IO Client

## Backend

* Node.js
* Express
* TypeScript
* Socket.IO

## Data

* PostgreSQL 17
* Prisma ORM
* Redis 7

## Security

* Argon2id
* SHA-256 session-token hashing
* HTTP-only cookies
* trusted-origin protection
* CORS
* input validation
* rate limiting

## Infrastructure

* Docker
* Docker Compose

---

# 🏗️ Architecture

```text
                   ┌──────────────────────────┐
                   │        Browser           │
                   │                          │
                   │ Next.js + React          │
                   │ Phaser                   │
                   └────────────┬─────────────┘
                                │
                        REST + Socket.IO
                                │
                                ▼
                   ┌──────────────────────────┐
                   │ Authoritative Game       │
                   │ Server                   │
                   │                          │
                   │ Node.js + Express        │
                   │ Socket.IO                │
                   │ GameManager              │
                   │ GameInstance             │
                   │ Combat Simulation        │
                   └─────────┬────────┬───────┘
                             │        │
                             ▼        ▼
                      PostgreSQL    Redis
```

### PostgreSQL

Stores durable identity data:

* users
* player profiles
* sessions

### Redis

Stores ephemeral multiplayer metadata:

* room state
* room membership
* room codes
* readiness
* host ownership
* game identifiers

### In-Memory Game Simulation

Stores high-frequency gameplay state:

* player positions
* inputs
* health
* projectiles
* eliminations
* respawn state
* active game state

High-frequency combat state is not written to PostgreSQL or Redis per tick.

---

# 🔐 Authentication

Authentication uses random opaque session tokens.

```text
Login / Registration
        │
        ▼
Random Session Token
        │
        ├── Raw token → HTTP-only Cookie
        │
        ▼
      SHA-256
        │
        ▼
Token Hash
        │
        ▼
PostgreSQL
```

Passwords use **Argon2id**.

Authenticated Socket.IO connections reuse the same secure session.

---

# 🏠 Multiplayer Rooms

Players enter multiplayer through:

```text
/play
```

Players can:

* create public rooms
* create private rooms
* join public rooms
* join private rooms using room codes
* ready up
* start matches
* leave rooms

Match lifecycle:

```text
WAITING
   │
   ▼
STARTING
   │
   ▼
IN_GAME
```

---

# 🎮 Arena

Current arena size:

```text
1600 × 900
```

Movement speed:

```text
260 units / second
```

Server simulation:

```text
20 Hz
```

Snapshot broadcasting:

```text
10 Hz
```

Remote interpolation delay:

```text
120 ms
```

---

# 🕹️ Controls

Movement:

```text
W A S D
```

or:

```text
Arrow Keys
```

Combat:

```text
Mouse      → Aim
Left Click → Fire
```

The client sends intent only.

The server owns movement, projectile creation, collision, and damage.

---

# 🔫 Basic Blaster

Current combat configuration:

```text
Maximum Health:      100
Projectile Damage:    25
Projectile Speed:    800 units/sec
Fire Cooldown:       300 ms
Projectile Lifetime:   2 seconds
Respawn Delay:         3 seconds
```

These values are enforced by the server.

Clients cannot modify them.

---

# 🎯 Aiming

Mouse position determines aim intent.

The client sends a normalized direction vector.

The server validates the direction before accepting it.

Clients cannot set:

* projectile spawn position
* projectile speed
* projectile damage
* projectile ID
* hit target
* hit result

---

# 💥 Projectiles

Projectiles are created exclusively by the authoritative server.

Each projectile has server-owned state such as:

* ID
* owner
* position
* direction
* speed
* damage
* lifetime

Projectiles disappear when they:

* hit a player
* leave arena bounds
* expire
* are removed with their owner on explicit departure

---

# 🎯 Collision Detection

Projectile collision uses **swept collision detection**.

This checks projectile travel across a simulation step rather than only checking its final position.

This reduces tunneling for fast-moving projectiles.

When several targets are intersected, the nearest valid target is selected.

A projectile can damage only one player.

Players cannot damage themselves with their own projectile.

---

# ❤️ Health & Damage

Each player begins with:

```text
100 / 100 HP
```

Each Basic Blaster hit deals:

```text
25 damage
```

Example:

```text
100 → 75 → 50 → 25 → 0
```

Health is server-controlled and cannot fall below zero.

Clients only render authoritative health values.

---

# ☠️ Eliminations

When health reaches zero:

* player becomes dead
* movement stops
* firing is disabled
* elimination counter updates
* death counter updates
* respawn timer begins

Dead players cannot continue controlling gameplay.

Duplicate elimination processing is prevented.

---

# 🔄 Respawning

Respawn occurs after:

```text
3 seconds
```

On respawn:

* full health is restored
* player becomes alive
* old movement input is cleared
* stale combat input is removed
* a new safe spawn position is selected

---

# 📍 Respawn Spawn Selection

Respawn placement evaluates **nine deterministic candidate positions**.

The server chooses the safest available candidate based on distance from living players.

This reduces immediate spawn overlap without introducing a full spawn-protection system.

Spawn protection is not yet implemented.

---

# 🔌 Combat Networking

Clients send typed gameplay intent.

Examples:

```text
game:aim
game:fire
```

Authoritative state is distributed through synchronized game snapshots.

Snapshots include safe combat information such as:

* health
* alive state
* aim direction
* eliminations
* deaths
* projectile positions

Sensitive identity/session data are never included.

---

# ⚡ Client Prediction

Movement remains client-predicted for responsiveness.

Combat does **not** use client-side hit prediction.

```text
Movement → predicted locally
Shot intent → server validated
Projectile → server authoritative
Hit → server authoritative
Damage → server authoritative
```

This avoids disagreement about combat results.

---

# 🌐 Projectile Rendering

Authoritative projectile state comes from the server.

Clients visually advance projectiles between snapshots to avoid visible 10 Hz stepping.

Rendering remains visual only.

The authoritative projectile remains server-owned.

---

# 🎨 Combat Presentation

The Phaser arena now includes:

* aim barrels
* glowing projectiles
* health bars
* hit flashes
* dead-state indicators
* respawn indicators
* player labels
* local-player identification

The combat HUD shows:

* health
* alive/respawning state
* eliminations
* deaths
* connection state
* match identity
* Leave Arena

---

# 🔄 Disconnect & Refresh Behavior

Temporary disconnects receive a:

```text
5-second grace period
```

During this time:

* player is frozen
* player cannot shoot
* player remains damageable

This prevents disconnecting from becoming an invulnerability exploit.

Refreshing preserves:

* position
* health
* alive/dead state
* respawn countdown
* fire cooldown
* eliminations
* deaths
* game membership

Refreshing does not restore full health or force a new spawn.

---

# 🖥️ Multiple Tabs

Only the newest active game controller may control the player.

Older tabs cannot continue submitting authoritative gameplay input.

---

# 🛡️ Anti-Cheat Foundation

Clients cannot directly:

* set health
* set damage
* claim hits
* choose projectile positions
* change projectile speed
* change projectile damage
* create projectile IDs
* bypass fire cooldown
* move while dead
* shoot while dead
* control other players
* fake eliminations
* force respawns
* spoof identity

The server is the source of truth for combat outcomes.

---

# ⚙️ Performance

Combat runs inside the existing shared game simulation loop.

The implementation avoids:

* per-projectile timers
* PostgreSQL queries per tick
* Redis writes per projectile
* client-authoritative collisions
* unnecessary network events

Simulation:

```text
20 ticks/sec
```

Snapshots:

```text
10/sec
```

---

# 🧪 Testing

Phase 5 verification:

```text
Backend Tests:      114
Shared Tests:        12
------------------------
Total:              126

Failed:               0
```

All previous applicable test coverage remains preserved.

Combat test coverage includes:

* aiming
* firing
* cooldown enforcement
* projectile creation
* projectile lifetime
* projectile bounds
* swept collision
* self-hit prevention
* authoritative damage
* health clamping
* elimination
* death restrictions
* respawning
* safe respawn selection
* refresh recovery
* disconnect behavior
* projectile cleanup
* secure snapshot payloads

---

# 🌐 Browser Verification

Two authenticated browser sessions were used for live combat verification.

Verified:

* room creation
* joining
* match start
* movement
* aiming
* firing
* remote projectile rendering
* health loss
* elimination
* respawn countdown
* respawning
* elimination/death counters
* cooldown enforcement
* self-hit prevention
* damaged-state refresh
* dead-state refresh
* projectile cleanup
* responsive layout
* browser console health

---

# ⚙️ Local Development

On the current machine, first configure the working Node runtime:

```bash
export PATH=/Users/lakshithlokesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

Start infrastructure:

```bash
docker compose up -d
```

Apply database migrations:

```bash
npm run db:migrate -w server
```

Start the server:

```bash
npm run dev:server
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

Backend:

```text
http://localhost:4000
```

Multiplayer:

```text
http://localhost:3000/play
```

---

# ⚠️ Current Limitations

Current gameplay supports one authoritative game-server process.

Active game/combat state is lost if the game server restarts.

Not yet implemented:

* spawn protection
* touch controls
* lag compensation / rewind
* persistent match statistics
* match timer
* final win conditions
* persistent match results
* match history
* matchmaking
* leaderboards
* spectators
* AI bots
* durable game recovery
* multi-server live simulation
* production deployment

Existing Prisma dependency advisories remain documented.

---

# 🗺️ Roadmap

## Phase 1 — Foundation & Architecture ✅

* Next.js
* Express
* Socket.IO
* Phaser foundation
* PostgreSQL
* Redis
* Docker

## Phase 2 — Authentication & Profiles ✅

* secure accounts
* player profiles
* PostgreSQL sessions
* authenticated Socket.IO

## Phase 3 — Multiplayer Rooms ✅

* public/private rooms
* room codes
* ready system
* host controls
* realtime lobby
* Redis room state

## Phase 4 — Real-Time Arena ✅

* Phaser arena
* spawning
* authoritative movement
* prediction
* reconciliation
* interpolation
* refresh recovery

## Phase 5 — Combat ✅

* aiming
* Basic Blaster
* projectiles
* collision detection
* health
* damage
* eliminations
* respawning
* combat HUD
* combat anti-cheat foundation

## Phase 6 — Match System

Planned:

* match timer
* live score
* win conditions
* end-of-match state
* results screen
* PostgreSQL match records
* match participants
* persistent eliminations/deaths
* rematch / return-to-lobby flow

## Phase 7 — Matchmaking

Planned:

* Redis matchmaking queue
* automatic room assignment
* rating foundations

## Phase 8 — Competitive Systems

Planned:

* player statistics
* match history
* leaderboards
* performance analytics

## Phase 9 — Advanced Multiplayer

Planned:

* durable reconnect
* spectators
* AI bots
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

# 🎯 Engineering Focus

This project demonstrates practical experience with:

* authoritative multiplayer networking
* Socket.IO
* server simulation loops
* state snapshots
* movement prediction
* reconciliation
* interpolation
* projectile simulation
* continuous collision detection
* combat state machines
* respawn logic
* anti-cheat architecture
* Phaser
* full-stack TypeScript
* PostgreSQL
* Prisma
* Redis
* secure authentication
* Docker

---

# 📊 Current Status

```text
Phase 5/10

Foundation & Architecture     ██████████ 100%
Authentication & Profiles     ██████████ 100%
Multiplayer Rooms             ██████████ 100%
Real-Time Arena               ██████████ 100%
Combat                        ██████████ 100%
Match System                  ░░░░░░░░░░   0%
Matchmaking                   ░░░░░░░░░░   0%
Competitive Systems           ░░░░░░░░░░   0%
Advanced Multiplayer          ░░░░░░░░░░   0%
Production Deployment         ░░░░░░░░░░   0%
```

---

Built as a full-stack real-time multiplayer engineering project.
