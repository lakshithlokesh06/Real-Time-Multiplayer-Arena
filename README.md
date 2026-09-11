# Real-Time Multiplayer Arena

A full-stack real-time multiplayer 2D arena game built with **Next.js, Phaser, Node.js, Express, Socket.IO, PostgreSQL, Prisma, and Redis**.

The project features secure player authentication, multiplayer rooms, server-authoritative movement and combat, complete match lifecycle management, persistent match results, automated matchmaking, and an Elo-based MMR system.

Players can create or join manual rooms or use automated matchmaking to find a similarly rated opponent, enter the arena, compete in real time, view match results, track match history, and receive persistent MMR updates.

---

## Features

### Authentication & Player Profiles

- Secure player registration and login
- Argon2id password hashing
- Opaque session tokens
- SHA-256 session-token hashing
- HTTP-only session cookies
- Session expiration and rotation
- Logout and session revocation
- Protected frontend routes
- Editable player display names
- Authenticated Socket.IO connections
- Server-resolved player identity
- Newest-tab controller enforcement

---

### Multiplayer Rooms & Lobby

- Create public rooms
- Create private rooms
- Join private rooms using room codes
- Browse available public rooms
- Configurable room capacity
- One active room per player
- Live room roster
- Player readiness
- Host ownership
- Automatic host transfer
- Room cleanup
- Redis-backed room state
- Five-second reconnect grace period
- Refresh recovery
- Explicit leave handling
- Responsive lobby interface

Manual rooms remain fully supported alongside automated matchmaking.

---

### Real-Time Arena

- Phaser-powered 2D arena
- 1600 × 900 world
- Distinct player spawn positions
- Smooth bounded camera
- Player labels
- Keyboard movement
- Normalized diagonal movement
- Movement speed of 260 units/second
- Server-authoritative simulation
- 20 Hz game simulation
- 10 Hz authoritative snapshots

---

### Multiplayer Networking

- Server-authoritative player state
- Intent-only client movement input
- Input sequence numbers
- Server acknowledgements
- Local player prediction
- Authoritative reconciliation
- Pending-input replay
- Remote-player interpolation
- 120 ms interpolation buffer
- Input validation
- Connection-state handling
- Refresh recovery
- Newest-tab controller policy

---

### Server-Authoritative Combat

Players use a basic **Blaster** weapon.

Combat configuration:

- 100 player health
- 25 projectile damage
- 800 units/second projectile speed
- 300 ms fire cooldown
- 2-second projectile lifetime
- 3-second respawn delay

Combat features:

- Server-authoritative projectile creation
- Server-authoritative hit detection
- Swept projectile collision
- No self-damage
- Authoritative health
- Eliminations
- Death tracking
- Live score tracking
- Projectile cleanup
- Hit feedback
- Health bars
- Respawn indicators
- Deterministic safe respawning
- Safest-of-nine spawn selection
- Stale-input protection after respawn

Disconnected players remain frozen and damageable during the reconnect grace period.

---

## Match System

The game supports a complete authoritative match lifecycle:

```text
WAITING
   ↓
STARTING
   ↓
IN_GAME
   ↓
FINISHED
   ↓
WAITING
```

### Match Configuration

Default match duration:

```text
180 seconds
```

The duration can be configured using:

```env
MATCH_DURATION_SECONDS=180
```

Accepted range:

```text
5–3600 seconds
```

The server owns:

- Match ID
- Match start time
- Match deadline
- Remaining time
- Scores
- Eliminations
- Deaths
- Match completion
- Final standings
- Winner determination

Clients cannot manipulate match results.

---

## Scoring & Win Conditions

Current scoring rule:

```text
1 elimination = 1 point
```

Matches end when the authoritative match timer expires.

When a match finishes:

- Movement is frozen
- Combat input is rejected
- Projectile creation stops
- Existing projectiles are removed
- Damage stops
- Respawning stops
- Scores are frozen
- Final standings are calculated
- Results are persisted
- Players receive the authoritative results screen

### Standings

Final standings are ordered by:

1. Higher score
2. Higher eliminations
3. Fewer deaths
4. Stable player-profile ID

Players tied on meaningful gameplay statistics can share winner status while deterministic ordering is retained for display and persistence.

---

## Match Results

At the end of a match, players receive a responsive results experience showing:

- Match result
- Winner
- Placement
- Player standings
- Score
- Eliminations
- Deaths
- Match duration
- MMR change for rated matches

Players can then return to the lobby.

Ready states and gameplay state are reset before another match.

A rematch creates:

- New match ID
- Fresh health
- Zero score
- Zero eliminations
- Zero deaths
- Fresh projectile state
- New persistent match record

---

# Automated Matchmaking

Players can use **Find Match** instead of manually creating or joining a room.

The matchmaking lifecycle is:

```text
IDLE
  ↓
QUEUED
  ↓
MATCH_FOUND
  ↓
ACCEPTED
  ↓
PREPARING ARENA
  ↓
STARTING
  ↓
IN_GAME
  ↓
FINISHED
```

Automatic matchmaking currently creates **1v1 matches**.

---

## Matchmaking Queue

The live matchmaking queue is managed using Redis.

Features include:

- Server-authoritative queue membership
- Duplicate queue prevention
- Queue cancellation
- Deterministic queue ordering
- Oldest-compatible-player priority
- Atomic matchmaking operations
- Stale-entry cleanup
- Duplicate-assignment prevention
- Refresh recovery
- Disconnect handling
- Newest-controller enforcement
- Manual-room conflict prevention
- Rated-match overlap protection

The matchmaking service runs a controlled matching cycle approximately once per second.

Automatic matchmaking rooms:

- Have two-player capacity
- Are created server-side
- Are separate from manual rooms
- Are excluded from normal public-room discovery
- Do not require a room code
- Do not require a player to manually press Start

---

## MMR-Based Opponent Search

Every player begins with:

```text
MMR: 1000
```

Matchmaking initially searches for opponents within a narrow rating range.

The range expands as queue time increases:

| Queue Time | Allowed Rating Difference |
|---|---:|
| 0–10 seconds | ±100 |
| 10–20 seconds | ±200 |
| 20–30 seconds | ±300 |
| 30+ seconds | Unrestricted |

This allows similarly rated players to be prioritized without leaving players stuck in the queue indefinitely.

---

## Match Found & Acceptance

When two compatible players are selected, both receive a **Match Found** state.

Acceptance deadline:

```text
10 seconds
```

Each player can:

- Accept
- Decline

If both accept:

```text
Match Found
    ↓
Both Accept
    ↓
Preparing Arena
    ↓
Automatic Room Assignment
    ↓
STARTING
    ↓
IN_GAME
```

No manual host action is required.

If one player declines or times out, the connected player who already accepted is returned to matchmaking while preserving reasonable queue priority.

A **15-second pair cooldown** prevents the same unsuccessful pairing from immediately repeating.

---

## Matchmaking Recovery

### Queue Disconnect

Queued players receive a five-second reconnect grace period.

Reconnecting within the grace period restores the existing queue state.

### Queue Refresh

Refreshing while searching restores:

- Queue membership
- Original queue time
- Current search state
- Cancel Search control

### Match Found Refresh

Refreshing during the acceptance phase restores:

- Match proposal
- Acceptance state
- Remaining authoritative deadline

### Active Match Refresh

Once assigned to a game, the existing authoritative gameplay recovery system takes over.

---

# Elo Rating System

Automated matchmaking matches are rated using an Elo-based MMR system.

Manual public/private room matches remain **unrated**.

### Initial Rating

```text
1000
```

### K-Factor

```text
32
```

Expected score:

```text
E = 1 / (1 + 10^((OpponentRating - PlayerRating) / 400))
```

Updated rating:

```text
NewRating = Rating + K × (ActualScore - ExpectedScore)
```

Where:

```text
Win  = 1.0
Tie  = 0.5
Loss = 0.0
```

Ratings are deterministically rounded to integers.

For an evenly rated match such as:

```text
1000 vs 1000
```

a normal win/loss produces approximately:

```text
Winner: +16
Loser:  -16
```

---

## Rating Integrity

Rating calculations are entirely server-side.

Clients cannot submit:

- Current MMR
- Previous MMR
- New MMR
- Rating delta
- Expected score
- Match outcome
- Placement
- Winner status

For rated matches, participant records preserve:

- Rating before
- Rating after
- Rating delta

MMR updates and match finalization are performed atomically and idempotently so a retry cannot apply the same rating change twice.

Manual matches do not alter MMR.

---

# Persistent Match History

Completed matches are stored in PostgreSQL.

The persistent match system records information such as:

- Match ID
- Match origin/type
- Start time
- End time
- Duration
- Participants
- Placement
- Score
- Eliminations
- Deaths
- Winner
- Rating before
- Rating after
- Rating delta

Match persistence occurs at lifecycle boundaries rather than during simulation ticks.

---

## Match History

Authenticated players can view their recent matches through the match-history experience.

Match history includes:

- Date/time
- Match result
- Placement
- Score
- Eliminations
- Deaths
- Duration
- MMR changes for rated matches

The dashboard also exposes recent-match information.

---

# Architecture

```text
┌───────────────────────────────┐
│        Next.js Frontend       │
│                               │
│ Lobby / Matchmaking / HUD     │
│ Phaser / Results / History    │
└───────────────┬───────────────┘
                │
          HTTP + Socket.IO
                │
┌───────────────▼───────────────┐
│       Express Game Server     │
│                               │
│ Authentication                │
│ Room Management               │
│ Matchmaking Service           │
│ GameManager                   │
│ GameInstance                  │
│ Combat Simulation             │
│ Match Lifecycle               │
│ Elo / MMR                     │
└──────────┬────────────┬───────┘
           │            │
           │            │
┌──────────▼──────┐ ┌───▼──────────────┐
│   PostgreSQL    │ │      Redis       │
│                 │ │                  │
│ Users           │ │ Rooms            │
│ Profiles        │ │ Membership       │
│ Sessions        │ │ Readiness        │
│ Matches         │ │ Queue            │
│ Participants    │ │ Proposals        │
│ MMR             │ │ Matchmaking      │
└─────────────────┘ └──────────────────┘
```

---

## Server Authority

The server is authoritative for:

- Authentication
- Player identity
- Room membership
- Queue membership
- Matchmaking
- Opponent selection
- Acceptance deadlines
- Match assignment
- Match IDs
- Movement
- Position
- Projectiles
- Hit detection
- Health
- Eliminations
- Deaths
- Respawning
- Match timing
- Scores
- Standings
- Match results
- MMR
- Rating changes

The client primarily handles:

- Input collection
- Local movement prediction
- Reconciliation
- Remote interpolation
- Phaser rendering
- UI presentation
- Smooth timer presentation

---

# Security

Implemented protections include:

- Argon2id password hashing
- Opaque session tokens
- SHA-256 session-token hashes
- HTTP-only cookies
- Session rotation
- Session revocation
- Credentialed CORS
- CSRF protection
- Request-size limits
- Rate limiting
- Input validation
- Authenticated Socket.IO
- Server-resolved identity
- Server-authoritative movement
- Server-authoritative combat
- Server-authoritative scoring
- Server-authoritative matchmaking
- Server-authoritative MMR
- Newest-tab controller enforcement
- Duplicate-assignment protection
- Rated-match overlap protection
- Idempotent result persistence
- Atomic rating updates

---

# Technology Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Phaser
- Socket.IO Client

## Backend

- Node.js
- Express
- TypeScript
- Socket.IO
- Prisma ORM

## Data

- PostgreSQL
- Redis

## Security

- Argon2id
- HTTP-only cookies
- SHA-256 session hashing
- CSRF protection
- Rate limiting
- Runtime input validation

---

# Project Structure

```text
real-time-multiplayer-arena/
├── frontend/
│   ├── src/
│   └── public/
│
├── server/
│   ├── src/
│   ├── prisma/
│   └── test/
│
├── shared/
│
├── docs/
│   ├── architecture.md
│   └── verification.md
│
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

---

# Local Development

## Requirements

Install:

- Node.js
- npm
- Docker
- Docker Compose

---

## Start Infrastructure

```bash
docker compose up -d --wait
```

The development infrastructure uses:

```text
PostgreSQL: 5433
Redis:      6380
```

---

## Apply Database Migrations

```bash
npm run db:migrate -w server
```

Generate the Prisma client:

```bash
npm run db:generate -w server
```

---

## Start Backend

```bash
npm run dev:server
```

Backend:

```text
http://localhost:4000
```

Health endpoint:

```text
GET /api/health
```

---

## Start Frontend

In another terminal:

```bash
npm run dev:frontend
```

Open:

```text
http://localhost:3000
```

---

# Testing & Verification

The project currently has:

```text
197 passing tests
```

Breakdown:

```text
185 backend tests
12 shared/networking tests
```

The test suite covers functionality including:

- Authentication
- Sessions
- Profiles
- Socket authentication
- Room creation/joining
- Public/private rooms
- Host transfer
- Readiness
- Reconnect grace
- Movement
- Prediction/reconciliation
- Combat
- Projectile collision
- Damage
- Eliminations
- Respawning
- Match lifecycle
- Match timing
- Scoring
- Results
- Match persistence
- Match history
- Rematches
- Matchmaking queues
- Queue priority
- MMR range expansion
- Match proposals
- Accept/decline
- Acceptance timeout
- Automatic room assignment
- Matchmaking recovery
- Queue concurrency
- Duplicate-assignment prevention
- Elo calculations
- Atomic MMR persistence
- Manual-match rating isolation
- Redis data-loss protection
- Multiple-tab controller enforcement

Phase 7 verification also passed:

- Prisma validation
- Prisma migrations
- Existing database compatibility
- Frontend lint
- Server lint
- TypeScript checks
- Frontend production build
- Server production build
- Two-player automatic-matchmaking browser QA
- Manual-room/rematch regression QA
- Refresh/recovery QA
- Responsive-layout QA
- Browser console checks

---

# Current Limitations

The current implementation intentionally has several limitations:

- Game and matchmaking authority currently assume a single server process
- Maximum active matchmaking queue is currently bounded at 200 entries
- Live matches are not durably recoverable after server restart
- Matchmaking queue/proposals are not designed as durable PostgreSQL state
- Redis namespace loss requires safe recovery/application restart
- No global leaderboard yet
- No ranked divisions or tiers yet
- No seasons
- No parties
- No team matchmaking
- No spectators
- No bots
- No tournaments
- No production deployment architecture yet

These are planned or intentionally deferred beyond Phase 7.

---

# Development Progress

| Phase | Feature | Status |
|---|---|---|
| Phase 1 | Project Foundation | ✅ Complete |
| Phase 2 | Authentication & Player Profiles | ✅ Complete |
| Phase 3 | Multiplayer Rooms & Lobby | ✅ Complete |
| Phase 4 | Real-Time Arena & Authoritative Movement | ✅ Complete |
| Phase 5 | Combat, Health, Eliminations & Respawning | ✅ Complete |
| Phase 6 | Match Lifecycle, Scoring, Results & Persistence | ✅ Complete |
| Phase 7 | Automated Matchmaking & MMR | ✅ Complete |
| Phase 8 | Player Statistics, Rankings & Leaderboards | ⏳ Planned |
| Phase 9 | Social / Competitive Features | ⏳ Planned |
| Phase 10 | Production Hardening & Deployment | ⏳ Planned |

---

# Phase 7 Status

Phase 7 introduced the first complete automated competitive matchmaking flow:

```text
Find Match
    ↓
Searching for Opponent
    ↓
MMR Compatibility Search
    ↓
Match Found
    ↓
Accept
    ↓
Preparing Arena
    ↓
Automatic Match
    ↓
Results
    ↓
Elo / MMR Update
    ↓
Match History
```

The project now supports both:

```text
Manual Rooms → Unrated Matches
```

and:

```text
Automated Matchmaking → Rated 1v1 Matches
```

This provides the foundation for persistent player statistics, ranked progression, divisions, and leaderboards in the next phase.

---

# License

This project is intended for educational, portfolio, and development purposes.
