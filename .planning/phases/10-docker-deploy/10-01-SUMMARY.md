---
phase: 10-docker-deploy
plan: 01
subsystem: infra
tags: [docker, dockerfile, turbo-prune, multi-stage-build, prisma-migrate, entrypoint]

# Dependency graph
requires:
  - phase: 09-claude-max
    provides: "Complete API codebase with worker entrypoint"
provides:
  - "API Dockerfile with turbo prune three-stage build"
  - "Worker entrypoint compiled to dist/worker.js"
  - "Migration entrypoint script for production container startup"
affects: [10-02, 10-03, 11-pipeline-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns: ["turbo prune --docker three-stage build", "entrypoint script for prisma migrate deploy"]

key-files:
  created:
    - apps/api/Dockerfile
    - scripts/docker-entrypoint-api.sh
    - apps/api/src/worker.ts
  modified:
    - apps/api/package.json

key-decisions:
  - "Relocated worker.ts into src/ instead of modifying tsconfig -- simplest approach, no config changes needed"
  - "Frozen-lockfile with pnpm install fallback in Dockerfile -- handles turbo prune + pnpm 10 compatibility issues"
  - "Entrypoint script uses prisma migrate deploy (not dev) -- production-safe, only applies pending migrations"

patterns-established:
  - "Three-stage Dockerfile: pruner (turbo prune) -> builder (pnpm install + tsc) -> runner (node:22-alpine)"
  - "Entrypoint script pattern: run migrations then exec server process"
  - "Same Dockerfile for API and worker containers (different CMD in compose)"

# Metrics
duration: 2min
completed: 2026-02-16
---

# Phase 10 Plan 01: API Dockerfile & Worker Build Fix Summary

**Three-stage turbo prune Dockerfile for API/worker container with worker.ts relocated to src/ for tsc compilation and migration entrypoint script**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-16T20:06:57Z
- **Completed:** 2026-02-16T20:09:38Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Relocated worker.ts from apps/api/ root into src/ so tsc compiles it to dist/worker.js
- Created three-stage API Dockerfile using turbo prune --docker for optimal monorepo builds
- Created migration entrypoint script that runs prisma migrate deploy before starting the API server
- Verified full build produces both dist/server.js and dist/worker.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Relocate worker.ts into src/ and fix build** - `2082093` (feat)
2. **Task 2: Create API Dockerfile and migration entrypoint script** - `bf6074c` (feat)

## Files Created/Modified
- `apps/api/src/worker.ts` - Worker entrypoint relocated from root, import paths corrected (no ./src/ prefix)
- `apps/api/package.json` - Updated dev:worker script path, added start:worker script for Docker CMD
- `apps/api/Dockerfile` - Three-stage multi-stage build: pruner, builder, runner with non-root user
- `scripts/docker-entrypoint-api.sh` - Entrypoint that runs prisma migrate deploy then starts API server

## Decisions Made
- Relocated worker.ts into src/ instead of modifying tsconfig -- simplest approach, existing include: ["src"] already covers it
- Used frozen-lockfile with fallback (`pnpm install --frozen-lockfile || pnpm install`) to handle known turbo prune + pnpm 10 compatibility issues
- Installed git + openssl in runner stage since the worker container (same image, different CMD) needs git for simple-git operations
- Used ENTRYPOINT for the entrypoint script so worker container can override with CMD in docker-compose

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- API Dockerfile ready for docker-compose.prod.yml integration (Plan 03)
- Web Dockerfile needed next (Plan 02) before compose can orchestrate all services
- Worker container uses same Dockerfile with different CMD: `["node", "apps/api/dist/worker.js"]`

## Self-Check: PASSED

- [x] apps/api/src/worker.ts - FOUND
- [x] apps/api/Dockerfile - FOUND
- [x] scripts/docker-entrypoint-api.sh - FOUND
- [x] apps/api/package.json - FOUND
- [x] Commit 2082093 - FOUND
- [x] Commit bf6074c - FOUND

---
*Phase: 10-docker-deploy*
*Completed: 2026-02-16*
