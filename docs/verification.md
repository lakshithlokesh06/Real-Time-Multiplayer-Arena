# Phase 1 verification

Verified on 2026-09-08 with Node 24.19.0 and npm 11.9.0.

| Check | Result |
| --- | --- |
| `npm install` | Passed; lockfile created, 580 packages installed |
| `npm run lint` | Passed for frontend and server, no warnings |
| `npm run typecheck` | Passed for both workspaces |
| `npm test` | Passed: 3 tests covering configuration, optional Redis failure, HTTP health/404/invalid JSON, Socket.IO connect/ping/pong/disconnect cleanup |
| `npm run db:validate` | Passed; model-free PostgreSQL schema is valid |
| `npm run build` | Passed; Next.js 16.3.4 production build and server TypeScript compilation |
| `docker compose --env-file .env.example config --quiet` | Passed with Docker Compose 5.3.1 |
| `npm run dev:server` | Started on port 4000 with unavailable Redis handled gracefully |
| `curl -fsS http://localhost:4000/api/health` | HTTP 200; correct service/version/environment/timestamp and dependency state |
| `npm run dev:frontend` | Started on port 3000 |
| HTTP requests to all seven frontend routes | HTTP 200 for each |
| Headless Chrome / Playwright smoke check | Phaser canvas initialized, unmounted, remounted with exactly one canvas; no page runtime errors; no horizontal overflow at 390px viewport |
| `git diff --check` | Passed |
| `npm audit` and `npm audit --omit=dev` | Both report 4 high advisories in the Prisma dependency chain; see below |

## Dependency audit limitation

The installed Prisma 7.10.0 toolchain pulls vulnerable `deepmerge-ts` (<8) and `mysql2` (<=3.23.0), reported through `@prisma/config` and `prisma` (four affected packages). Prisma is declared as a development dependency, but the client peer relationship means `--omit=dev` still reports these. Do not assume a production install automatically removes them. No Prisma runtime client or MySQL connection is used by this foundation.

- [DeepmergeTS recursive graph stack exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
- [MySQL2 authentication downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr)
- [MySQL2 compressed protocol decompression](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3)

npm proposes a major downgrade to Prisma 6.19.3. No forced downgrade or unvalidated transitive major override was applied. Resolve or reassess the Prisma dependency chain before a production deployment, especially before database functionality is added. This is an outstanding dependency limitation, not a clean audit result.

## Environment notes

The system Homebrew Node executable fails to load its simdjson library. Verification used the desktop bundled Node runtime by prepending its `bin` directory to PATH. A normal working Node 24 installation is sufficient for the documented commands. Network installation and local socket/browser tests required the execution environment's expanded permissions; they then passed.

Docker configuration was validated; infrastructure containers were not started, and database connectivity/migrations were not tested. Redis unavailable behavior was tested with an actual refused connection. Successful Redis connectivity is not claimed. The Prisma schema has no models, so no migration or generated client was required. No gameplay, authentication, provider deployment, Git commit, or push was performed.
