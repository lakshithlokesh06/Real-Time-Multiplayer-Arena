# Real-Time Multiplayer Arena

A full-stack real-time multiplayer 2D arena game built with **Next.js, Phaser, Node.js, Express, Socket.IO, PostgreSQL, Prisma, and Redis**.

The project features secure authentication, multiplayer rooms, server-authoritative movement and combat, complete match lifecycle management, automated matchmaking, Elo-based MMR, persistent player statistics, ranked divisions, leaderboards, match history, and competitive player profiles.

Players can create or join manual rooms for unrated matches or use automated matchmaking to find similarly rated opponents and compete in ranked 1v1 matches.

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
- Editable display names
- Authenticated Socket.IO connections
- Server-resolved player identity
- Newest-tab controller enforcement

---

### Multiplayer Rooms & Lobby

- Public room creation
- Private rooms with room codes
- Public room browser
- Configurable room capacity
- One active room per player
- Live room roster
- Player readiness
- Host ownership and transfer
- Redis-backed room state
- Five-second reconnect grace period
- Refresh recovery
- Explicit leave handling
- Responsive lobby UI

Manual rooms coexist with automated matchmaking and remain unrated.

---

## Real-Time Arena

The arena uses Phaser for rendering while the server remains authoritative over gameplay.

### Arena

- 1600 × 900 game world
- Distinct spawn positions
- Smooth bounded camera
- Player labels
- Keyboard movement
- Normalized diagonal movement
- 260 units/second movement speed

### Simulation

```text
Server Simulation: 20 Hz
Snapshots:         10 Hz
Interpolation:     120 ms
```

The server does not perform database or Redis writes every simulation tick.

---

## Multiplayer Networking

Networking includes:

- Intent-only player inputs
- Server-authoritative movement
- Input sequence numbers
- Server acknowledgements
- Local prediction
- Authoritative reconciliation
- Pending-input replay
- Remote-player interpolation
- Input validation
- Connection-state recovery
- Refresh recovery
- Newest-tab controller policy

---

# Server-Authoritative Combat

Players currently use a basic **Blaster** weapon.

### Combat Configuration

```text
Health:              100
Projectile Damage:   25
Projectile Speed:    800 units/sec
Fire Cooldown:       300 ms
Projectile Lifetime: 2 seconds
Respawn Delay:       3 seconds
```

### Combat Features

- Server-authoritative projectiles
- Server-authoritative hit detection
- Swept projectile collision
- No self-damage
- Authoritative health
- Eliminations
- Death tracking
- Score tracking
- Projectile cleanup
- Health bars
- Hit feedback
- Respawn indicators
- Safe deterministic respawning
- Safest-of-nine spawn selection
- Stale-input protection after respawn

Disconnected players remain frozen and damageable during the reconnect grace period.

---

# Match Lifecycle

The authoritative match lifecycle is:

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

The server owns:

- Match ID
- Match start time
- Match deadline
- Remaining time
- Scores
- Eliminations
- Deaths
- Match completion
- Standings
- Winner determination
- Persistent results

---

## Match Duration

Default:

```text
180 seconds
```

Configurable through:

```env
MATCH_DURATION_SECONDS=180
```

Supported range:

```text
5–3600 seconds
```

---

# Scoring & Results

Current scoring:

```text
1 elimination = 1 point
```

When time expires:

- Movement freezes
- Combat stops
- New projectiles are rejected
- Existing projectiles are removed
- Damage stops
- Respawning stops
- Scores freeze
- Final standings are generated
- Results are persisted

### Standings Order

1. Higher score
2. Higher eliminations
3. Fewer deaths
4. Stable profile ID

Meaningful gameplay ties can share winner status while retaining deterministic ordering.

---

# Match Results & Rematches

Results display:

- Winner/result
- Placement
- Score
- Eliminations
- Deaths
- Match duration
- Rated/unrated status
- MMR change for ranked matches

Rematches receive:

- New match ID
- Full health
- Zero score
- Zero eliminations
- Zero deaths
- Fresh projectile state
- New persistent match result

---

# Automated Matchmaking

Players can choose **Find Match** instead of creating or joining a manual room.

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

Automated matchmaking currently supports:

```text
1v1 Ranked Matches
```

---

## Matchmaking Queue

Redis manages the live matchmaking state.

Features include:

- Server-authoritative queue membership
- Duplicate queue prevention
- Idempotent cancellation
- Oldest-compatible-player priority
- MMR compatibility
- Expanding search ranges
- Atomic queue operations
- Proposal recovery
- Stale-entry cleanup
- Duplicate-assignment protection
- Disconnect recovery
- Refresh recovery
- Rated-match overlap protection
- Manual-room conflict prevention

The matchmaking service evaluates the queue approximately once per second.

---

## MMR Search Expansion

Players initially search for similarly rated opponents.

| Queue Time | Rating Difference |
|---|---:|
| 0–10 sec | ±100 |
| 10–20 sec | ±200 |
| 20–30 sec | ±300 |
| 30+ sec | Unrestricted |

This prioritizes balanced matches while preventing excessively long queue times.

---

# Match Found

Once two compatible players are selected, both receive a Match Found proposal.

Acceptance deadline:

```text
10 seconds
```

Flow:

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

Matchmaking rooms:

- Have capacity 2
- Are created server-side
- Are excluded from the public room browser
- Do not use manual room codes
- Do not require host Start
- Automatically enter the game pipeline

---

## Decline & Timeout

If a player declines or does not respond before the deadline:

- The proposal is cancelled
- A connected opponent who already accepted can return to the queue
- Original queue priority is preserved where appropriate
- No MMR penalty occurs

A:

```text
15-second pair cooldown
```

prevents the same unsuccessful pairing from immediately repeating.

---

# Matchmaking Recovery

### Queue Refresh

Refreshing while queued restores:

- Queue membership
- Queue priority
- Search state
- Cancel Search control

### Match Found Refresh

Refreshing during acceptance restores:

- Match proposal
- Acceptance status
- Remaining authoritative deadline

### Disconnect

Queued players receive a five-second reconnect grace period.

### Active Match

Once assigned, the existing gameplay reconnect/recovery system handles the player.

---

# Elo MMR System

Every player begins with:

```text
MMR: 1000
```

Rated matchmaking uses Elo.

### K-Factor

```text
K = 32
```

### Expected Score

```text
E = 1 / (1 + 10^((OpponentRating - PlayerRating) / 400))
```

### Rating Update

```text
NewRating = Rating + K × (ActualScore - ExpectedScore)
```

Where:

```text
Win  = 1.0
Tie  = 0.5
Loss = 0.0
```

Ratings use deterministic integer rounding.

For two players at 1000 MMR:

```text
Winner: approximately +16
Loser:  approximately -16
```

---

# Rated vs Unrated Matches

The game deliberately separates competitive and casual play.

### Automated Matchmaking

```text
RATED
```

Affects:

- MMR
- Ranked wins/losses/ties
- Peak MMR
- Win streaks
- Ranked statistics
- Division
- Leaderboard position
- Recent competitive form

### Manual Rooms

```text
UNRATED
```

Manual matches can affect appropriate overall/unrated career totals but do not affect:

- MMR
- Ranked wins
- Ranked losses
- Ranked ties
- Ranked division progression
- Ranked leaderboard progression

Abandoned empty-room matches are excluded from career statistics.

---

# Persistent Player Statistics

Phase 8 introduces persistent competitive statistics through the `PlayerStatistics` model.

The database tracks authoritative career information including:

- Total matches
- Rated matches
- Unrated matches
- Wins
- Losses
- Ties
- Eliminations
- Deaths
- Rated wins
- Rated losses
- Rated ties
- Rated eliminations
- Rated deaths
- Peak MMR
- Current win streak
- Best win streak

Statistics are updated only from authoritative finalized match results.

Clients cannot submit or modify career statistics.

---

## Statistics Integrity

Statistics updates participate in the authoritative match-finalization process.

The design protects against:

- Duplicate finalization
- Retries
- Refreshes
- Reconnects
- Multiple socket handlers
- Concurrent persistence attempts
- Duplicate MMR application
- Duplicate statistics increments

Rated match finalization coordinates:

```text
Match Result
     ↓
MatchParticipant
     ↓
MMR Update
     ↓
Player Statistics
     ↓
Persistent Finalization
```

The process is transactional and idempotent.

---

# Ranked Divisions

Players receive a competitive division derived directly from current MMR.

| Division | MMR |
|---|---:|
| Bronze | < 900 |
| Silver | 900–1099 |
| Gold | 1100–1299 |
| Platinum | 1300–1499 |
| Diamond | 1500–1699 |
| Master | 1700+ |

A new player begins at:

```text
1000 MMR
Silver
```

Division is derived from MMR rather than being independently client-controlled.

---

## Division Progress

Profiles display progress toward the next division.

Example:

```text
Silver
MMR 1042
58 MMR to Gold
```

Master is currently the highest division and therefore has no artificial next-tier target.

---

# Competitive Metrics

Player profiles expose competitive metrics derived from authoritative statistics.

### Win Rate

Win rate uses rated wins divided by completed rated outcomes.

Ties remain part of the rated-match denominator.

### K/D Ratio

```text
K/D = Eliminations / Deaths
```

When deaths are zero, the displayed K/D uses eliminations rather than producing `Infinity` or `NaN`.

### Peak MMR

Peak MMR:

- Records the highest rating achieved
- Increases when a new rating exceeds the previous peak
- Never decreases

### Win Streak

Rules:

```text
Win  → streak + 1
Loss → streak resets
Tie  → streak resets
```

The system stores:

- Current win streak
- Best win streak

---

# Ranked Leaderboard

The `/leaderboard` route provides the competitive ranking experience.

Players must complete at least:

```text
1 rated match
```

before appearing on the ranked leaderboard.

Players without a rated match remain:

```text
Unranked
```

---

## Leaderboard Ordering

Players are ranked by:

1. Higher MMR
2. More rated wins
3. Better win rate
4. Stable profile ID

This guarantees deterministic ordering.

---

## Leaderboard Information

The leaderboard displays safe public competitive information such as:

- Rank
- Player
- Division
- MMR
- Wins
- Losses
- Win rate
- K/D

Private account information is never exposed.

The logged-in player's position is highlighted.

---

## Leaderboard Pagination

Authenticated endpoint:

```http
GET /api/leaderboard
```

Pagination:

```http
GET /api/leaderboard?page=1&limit=25
```

Defaults:

```text
Default page size: 25
Maximum page size: 50
```

The API also exposes the authenticated player's personal rank even when they are outside the currently displayed page.

---

# Recent Competitive Form

The player experience displays the five most recent completed rated matches.

Example:

```text
W  W  L  W  T
```

Where:

```text
W = Win
L = Loss
T = Tie
```

Recent form is derived from existing match-participant history rather than maintained in a separate database table.

Players with no rated matches receive an appropriate unranked/empty state.

---

# Competitive Profile

The player profile now provides a competitive summary including:

- Display name
- Division
- Current MMR
- Peak MMR
- Leaderboard rank
- Rated matches
- Wins
- Losses
- Ties
- Win rate
- Eliminations
- Deaths
- K/D ratio
- Current win streak
- Best win streak
- Recent W/L/T form
- Division progress

---

# Dashboard

The dashboard provides a compact competitive overview including:

- Current division
- Current MMR
- Leaderboard rank
- Recent competitive form
- Latest rated match
- Competitive statistics

The full profile remains available for deeper player statistics.

---

# Persistent Match History

Completed matches are stored in PostgreSQL.

Match records preserve information such as:

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

History distinguishes:

```text
Rated
Unrated
```

matches.

Historical match results created before the Phase 8 statistics system are not automatically backfilled into career counters.

---

# Architecture

```text
┌─────────────────────────────────┐
│          Next.js Client         │
│                                 │
│ Lobby / Matchmaking / Profile   │
│ Leaderboard / Phaser / Results  │
└────────────────┬────────────────┘
                 │
           HTTP + Socket.IO
                 │
┌────────────────▼────────────────┐
│       Express Game Server       │
│                                 │
│ Authentication                  │
│ Room Management                 │
│ Matchmaking Service             │
│ GameManager / GameInstance      │
│ Combat Simulation               │
│ Match Lifecycle                 │
│ Match Finalization              │
│ Elo / MMR                       │
│ Statistics                      │
│ Ranked Divisions                │
│ Leaderboard                     │
└────────────┬───────────┬────────┘
             │           │
             │           │
┌────────────▼──────┐ ┌──▼───────────────┐
│    PostgreSQL     │ │      Redis       │
│                   │ │                  │
│ Users             │ │ Rooms            │
│ Profiles          │ │ Membership       │
│ Sessions          │ │ Readiness        │
│ Matches           │ │ Queue            │
│ Participants      │ │ Proposals        │
│ MMR               │ │ Matchmaking      │
│ PlayerStatistics  │ │ Ephemeral State  │
└───────────────────┘ └──────────────────┘
```

---

# Server Authority

The server remains authoritative over:

- Authentication
- Player identity
- Room membership
- Queue membership
- Matchmaking
- Opponent selection
- Acceptance deadlines
- Match assignment
- Movement
- Position
- Combat
- Projectiles
- Hit detection
- Health
- Eliminations
- Deaths
- Respawning
- Match timing
- Scores
- Standings
- Results
- MMR
- Career statistics
- Ranked statistics
- Divisions
- Leaderboard ordering
- Competitive rank

The client handles presentation, input collection, prediction, reconciliation, interpolation, and UI.

---

# Security

Implemented protections include:

- Argon2id password hashing
- Opaque session tokens
- SHA-256 token hashing
- HTTP-only cookies
- Session expiration
- Session rotation
- Session revocation
- Credentialed CORS
- CSRF protection
- Request-size limits
- Rate limiting
- Runtime input validation
- Authenticated Socket.IO
- Server-resolved player identity
- Server-authoritative movement
- Server-authoritative combat
- Server-authoritative scoring
- Server-authoritative matchmaking
- Server-authoritative MMR
- Server-authoritative statistics
- Newest-tab controller enforcement
- Duplicate assignment protection
- Rated-match overlap protection
- Atomic result persistence
- Idempotent statistics updates
- Atomic MMR updates
- Safe leaderboard fields
- Pagination validation

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
- Runtime validation

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

Development services:

```text
PostgreSQL: 5433
Redis:      6380
```

---

## Database

Apply migrations:

```bash
npm run db:migrate -w server
```

Generate Prisma client:

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

Health:

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

# Database Migrations

Phase 8 added:

```text
20260912050000_player_statistics
```

The migration introduces persistent player statistics while preserving existing development data.

Existing users receive safe default statistics.

---

# Testing & Verification

Current test suite:

```text
233 passing tests
```

Breakdown:

```text
221 backend
12 shared/networking
```

No failures or skipped tests were reported during Phase 8 verification.

---

## Phase 8 Test Coverage

Coverage includes:

### Authentication & Rooms

- Authentication
- Sessions
- Profiles
- Socket authentication
- Public/private rooms
- Host transfer
- Readiness
- Reconnect recovery

### Gameplay

- Movement
- Prediction
- Reconciliation
- Combat
- Projectiles
- Damage
- Eliminations
- Deaths
- Respawning
- Match lifecycle
- Match timing
- Scoring
- Results
- Rematches

### Matchmaking

- Queue membership
- Queue cancellation
- Queue priority
- MMR compatibility
- Expanding MMR ranges
- Match proposals
- Accept/decline
- Acceptance timeout
- Automatic room assignment
- Refresh recovery
- Queue concurrency
- Duplicate-assignment prevention
- Redis protection

### MMR

- Elo calculations
- Atomic MMR updates
- Retry safety
- Manual-match isolation
- Match history rating changes

### Player Statistics

- Default statistics
- Rated match counters
- Unrated match counters
- Wins
- Losses
- Ties
- Eliminations
- Deaths
- Peak MMR
- Win streaks
- Best win streak
- Duplicate-finalization protection

### Divisions

- Bronze boundary
- Silver boundary
- Gold boundary
- Platinum boundary
- Diamond boundary
- Master boundary
- Starting division
- Division progress
- Highest-tier behavior

### Leaderboard

- Eligibility
- MMR ordering
- Win tie-breakers
- Win-rate tie-breakers
- Deterministic ordering
- Pagination
- Personal rank
- Safe public fields
- Unranked behavior

### Competitive Metrics

- Win rate
- K/D
- Zero-death handling
- Recent form
- Personal rank

---

# Phase 8 Verification

Phase 8 passed:

- 233 automated tests
- Prisma schema validation
- Prisma migration verification
- Existing database compatibility
- Frontend lint
- Server lint
- TypeScript checks
- Frontend production build
- Server production build

Two-player browser QA also verified:

- Rated matchmaking
- MMR changes
- Career statistics
- Leaderboard ordering
- Player rank
- Peak MMR
- Win streak behavior
- Recent form
- Manual-match ranked-stat isolation
- Rated/unrated history
- Desktop layout
- Tablet layout
- Mobile layout

No significant browser console errors were reported.

---

# Current Limitations

The project currently has several intentional limitations:

- Single-process game/matchmaking authority
- Matchmaking queue currently bounded at 200 players
- No durable live-match recovery after application restart
- Matchmaking queue/proposals are ephemeral Redis state
- Protected Redis namespace loss can require application restart
- Historical results are not backfilled into Phase 8 career statistics
- Large-scale leaderboard performance has not yet been benchmarked
- No seasons
- No placement matches
- No MMR resets
- No sub-divisions
- No parties
- No team matchmaking
- No friends/social system
- No direct player challenges
- No spectators
- No bots
- No tournaments
- No production deployment architecture yet

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
| Phase 8 | Player Statistics, Ranked Divisions & Leaderboards | ✅ Complete |
| Phase 9 | Social & Competitive Player Features | ⏳ Planned |
| Phase 10 | Production Hardening & Deployment | ⏳ Planned |

---

# Current Competitive Flow

The complete ranked experience is now:

```text
Login
  ↓
Find Match
  ↓
MMR-Based Search
  ↓
Match Found
  ↓
Accept
  ↓
Preparing Arena
  ↓
Ranked 1v1 Match
  ↓
Final Results
  ↓
Elo Update
  ↓
Career Statistics Update
  ↓
Division Update
  ↓
Leaderboard Rank
  ↓
Match History
  ↓
Recent Form
  ↓
Queue Again
```

Manual rooms provide a separate unrated experience:

```text
Create / Join Room
       ↓
Ready
       ↓
Manual Match
       ↓
Results
       ↓
Unrated Career Totals
```

This separation keeps competitive MMR and ranked progression isolated from casual/manual matches.

---

# Phase 8 Status

Phase 8 completes the core competitive progression foundation.

The project now combines:

```text
Authentication
      +
Multiplayer Rooms
      +
Server-Authoritative Gameplay
      +
Combat
      +
Match Lifecycle
      +
Persistent Results
      +
Automated Matchmaking
      +
Elo MMR
      +
Career Statistics
      +
Ranked Divisions
      +
Leaderboards
      +
Competitive Profiles
```

This provides the foundation for future social and competitive features without weakening the existing server-authoritative architecture.

---

# License

This project is intended for educational, portfolio, and development purposes.
