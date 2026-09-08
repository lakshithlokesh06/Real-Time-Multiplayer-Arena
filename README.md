# Real-Time Multiplayer Arena

A browser-based competitive arena project with a Next.js/Phaser client and an authoritative Node.js game server architecture.

**Current status: Phase 1 — foundation.** The landing page, route placeholders, Phaser engine preview, health endpoint, and diagnostic socket lifecycle are implemented. There is no playable game, authentication, matchmaking, or persistent player data yet.

## Stack and architecture

npm workspaces · Next.js 16 · React 19 · TypeScript (strict) · Tailwind CSS 4 · Phaser 3 · Express 5 · Socket.IO 4 · Prisma 7/PostgreSQL · node-redis.

React owns UI, Phaser owns rendering, and the future server simulation will own game state. PostgreSQL stores durable records; Redis supports ephemeral coordination. See [architecture](docs/architecture.md) for boundaries and the intended Vercel/Railway/Supabase-or-Neon/Upstash deployment.

## Repository

```text
frontend/
  src/app/                 # Landing, play, and future-feature routes
  src/components/          # Navigation, placeholders, client-only game loader
  src/game/scenes/          # Phaser creation, canvas lifecycle, boot scene
  src/lib/                 # Public endpoint configuration
  .env.example
server/
  src/config/              # Validated environment and optional Redis
  src/routes/              # HTTP health
  src/socket/              # Socket lifecycle
  src/middleware/          # JSON error handling
  src/types/               # Socket event contracts
  src/utils/               # Structured logging
  prisma/schema.prisma     # PostgreSQL foundation, no domain models
  prisma.config.ts
  test/                    # HTTP, socket, environment, Redis integration tests
  .env.example
docs/architecture.md
docker-compose.yml
.env.example               # Local infrastructure configuration
package.json               # Workspace commands
package-lock.json
```

Hooks, API services, domain/game services, and shared contracts will be added with actual consumers rather than unused stubs.

## Local setup

Prerequisites: Node.js 24 LTS (see `.nvmrc`), npm, and Docker Compose v2 or newer for optional infrastructure. Run from repository root:

```sh
npm ci
cp .env.example .env
cp frontend/.env.example frontend/.env.local
cp server/.env.example server/.env
```

Choose a local PostgreSQL password in root `.env` and put the same URL-encoded password into `server/.env`'s `DATABASE_URL`. The template's value is a development example, not a production secret. Environment files are ignored by Git.

```sh
docker compose up -d
npm run db:validate
npm run dev:server
```

In a second terminal:

```sh
npm run dev:frontend
```

Open [localhost:3000](http://localhost:3000). Test the server at [localhost:4000/api/health](http://localhost:4000/api/health):

```sh
curl http://localhost:4000/api/health
```

The frontend and server can run without Docker. Database access is deferred; unavailable Redis is logged and reported in health without blocking startup. To disable Redis entirely, leave `REDIS_URL` empty.

## Environment

| File | Variable | Purpose / local value |
| --- | --- | --- |
| frontend/.env.local | NEXT_PUBLIC_API_URL | REST origin, http://localhost:4000 |
| frontend/.env.local | NEXT_PUBLIC_SOCKET_URL | Socket origin, http://localhost:4000 |
| server/.env | NODE_ENV | development, test, or production |
| server/.env | PORT | HTTP/Socket.IO port, 4000 |
| server/.env | FRONTEND_URL | Exact allowed origin, http://localhost:3000 (no trailing slash); required in production |
| server/.env | DATABASE_URL | PostgreSQL URL used by Prisma CLI; future runtime persistence |
| server/.env | REDIS_URL | Optional redis:// or rediss:// endpoint |
| .env | POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB | Local database credentials/name |
| .env | POSTGRES_PORT / REDIS_PORT | Host ports 5433 / 6380 |

Public frontend variables are build-time configuration and must never contain secrets. Workspace scripts run with each application's working directory so dotenv reads `server/.env`. The root `.env` is for Compose only.

## Routes and protocol

Frontend: `/`, `/play` (engine preview), `/login`, `/register`, `/dashboard`, `/leaderboard`, `/profile` (honest future-feature placeholders).

`GET /api/health` returns service, status, environment, version, timestamp, and dependency state. It is liveness only and does not query PostgreSQL. Unmatched routes return JSON 404; invalid request bodies receive JSON client errors.

Socket.IO clients connect to the backend origin, emit `system:ping` without a payload, and receive `system:pong` with `{ socketId, timestamp }`. Connection and disconnection are logged. No rooms or gameplay events are exposed.

Phaser is imported through a client-only dynamic boundary, initialized per mount, and destroyed during effect cleanup. `/play` only renders a static boot scene; no controls, simulation, or networked gameplay exist.

## Checks and production builds

```sh
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run build
docker compose config --quiet
```

Build first, then run `npm run start -w server` and `npm run start -w frontend` in separate terminals. Prisma validation needs `DATABASE_URL` but does not require a running database. The schema intentionally contains no models; client generation, a runtime driver adapter, migrations, and database readiness checks are deferred until models are introduced.

Infrastructure lifecycle:

```sh
docker compose ps
docker compose down
```

Named volumes survive `down`; `docker compose down -v` deletes local database/Redis data. Host ports are bound to loopback to avoid accidental LAN exposure.

## Roadmap (not implemented)

1. Authentication, account and player models, profile UI.
2. Public/private rooms, presence, matchmaking.
3. Authoritative movement and live state synchronization.
4. Combat, health, death/respawn, power-ups, match lifecycle.
5. Results, statistics, match history, leaderboards.
6. Reconnection, spectators, AI bots, scaling and operational hardening.

This phase does not deploy services or implement any of the above. See `docs/verification.md` for verification results and local environment limitations.
