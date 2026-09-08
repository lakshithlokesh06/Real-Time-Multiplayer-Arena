# Architecture

Phase 1 establishes process boundaries; gameplay and identity are intentionally absent.

## Frontend

Next.js App Router renders navigation, the landing page, and explicit future-feature placeholders. React owns UI and routing. Phaser owns its canvas and scenes under `frontend/src/game`; a client component dynamically imports it with SSR disabled. Each mounted canvas creates one game, and effect cleanup destroys that instance (including React Strict Mode remounts). Phaser has no network connection yet. Public endpoint configuration lives in `frontend/src/lib/config.ts` for future HTTP and Socket.IO services.

Add hooks, services, and shared frontend types when their first consumers arrive; avoid empty abstraction layers. Reusable components and scene creation already have separate boundaries.

## Game server

Express handles REST endpoints. Socket.IO shares the same Node HTTP listener, allowing deployment as one persistent service. Configuration is parsed before startup. App creation is separate from listening for isolated integration tests. Routes, socket handlers, middleware, configuration, logging, and event contracts have distinct modules. Future game simulation belongs in `server/src/game`, orchestration in `server/src/services`, when implemented.

The server will be authoritative: clients send intent, never trusted position, damage, health, or results. Future server ticks will validate movement and attacks, resolve combat, and broadcast snapshots. This prevents a modified client from deciding match outcomes. No tick loop, rooms, or simulation exists yet.

## Communication

REST is for request/response work: health now; accounts, profiles, match history, and leaderboard queries later. Socket.IO is for low-latency bidirectional events: diagnostic ping/pong now; input, state updates, and match lifecycle later. `system:ping` takes no payload; `system:pong` contains the server timestamp and socket ID. Socket IDs are ephemeral transport identifiers, not authenticated player identities.

Origin restrictions reduce unintended browser connections but are not authentication. Before public gameplay, add authentication, authorization, runtime payload validation, input limits, rate limiting, and abuse monitoring. TypeScript event contracts do not validate untrusted runtime data.

## PostgreSQL and Prisma

PostgreSQL will hold durable accounts, player profiles, match results, statistics, and related records. Prisma 7 uses `server/prisma.config.ts` for its datasource URL and `server/prisma/schema.prisma` for PostgreSQL and generator settings. The schema has no models or migrations. Add domain models before generating the client; integrate a PostgreSQL driver adapter and lazy database service at the first real database feature. The server currently makes no database calls. `/api/health` is liveness, not database readiness.

## Redis

Redis will hold ephemeral presence, matchmaking queues, room metadata, and coordination/rate-limit state. It is not the source of durable match results. Phase 1 uses node-redis with a bounded connection timeout and no automatic reconnect loop. Unset URL means disabled; failed connection means unavailable; either state permits HTTP and sockets to run. Restart the process after restoring Redis. Later phases must decide feature-specific readiness and retry policies. Shutdown closes Redis and Socket.IO; a five-second deadline bounds shutdown.

## Deployment

Expected providers are Vercel for Next.js, Railway for the persistent Node game server, Supabase or Neon for PostgreSQL, and Upstash Redis for ephemeral state. Services remain provider-independent and are configured through environment variables. The Node Redis client requires the provider's TCP/TLS `rediss://` endpoint, not its REST URL. Never place database or Redis credentials in `NEXT_PUBLIC_*` variables.

Use HTTPS/WSS publicly, a dedicated backend origin, and managed database TLS/pooling as supported by the chosen provider. Vercel serves UI; long-lived Socket.IO connections terminate on Railway. Start with one game-server instance. Horizontal scaling later requires a compatible Socket.IO adapter, sticky sessions when polling is enabled, and explicit ownership of each authoritative room. A Redis adapter alone does not distribute a simulation. Deployments, provider credentials, and CI/CD are not configured in this phase.

## Local infrastructure

Compose runs infrastructure only: PostgreSQL 17 on loopback port 5433 and Redis 7 on loopback port 6380, with health checks and persistent named volumes. Applications run on the host (3000 and 4000). Alternative ports can be set in root `.env`; update server URLs accordingly. These development services are not a production security configuration.
