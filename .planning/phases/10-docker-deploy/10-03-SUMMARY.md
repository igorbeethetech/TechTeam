---
phase: 10-docker-deploy
plan: 03
subsystem: infra
tags: [docker, docker-compose, production, multi-service, prisma-migrate, tsx, turbo-prune]

# Dependency graph
requires:
  - phase: 10-01
    provides: "API Dockerfile with turbo prune three-stage build and migration entrypoint"
  - phase: 10-02
    provides: "Web Dockerfile with standalone Next.js output"
provides:
  - "Production docker-compose.prod.yml orchestrating all 5 services"
  - "Complete .env.example with all production variables documented"
  - ".dockerignore for optimized Docker context"
  - "Verified full-stack Docker deployment with single command"
affects: [11-pipeline-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns: ["docker-compose multi-service orchestration", "tsx/esm loader for TypeScript workspace packages in production", "prisma generate with dummy DATABASE_URL during Docker build"]

key-files:
  created:
    - docker-compose.prod.yml
    - .dockerignore
  modified:
    - .env.example
    - package.json
    - apps/api/Dockerfile
    - apps/web/Dockerfile
    - scripts/docker-entrypoint-api.sh

key-decisions:
  - "tsx/esm loader for production runtime -- workspace packages export raw .ts files, node --import tsx/esm resolves them without bundling"
  - "Prisma generate with dummy DATABASE_URL in builder stage -- .dockerignore excludes generated/, must regenerate for Alpine Linux"
  - "Root tsconfig.json explicit COPY in Dockerfiles -- turbo prune out/full/ only includes workspace packages, not root configs"
  - "PNPM_HOME env var required in pruner stage -- pnpm 10.x requires explicit global bin directory for pnpm add -g"
  - "NODE_OPTIONS=--max-old-space-size=8192 in builder stage -- tsc OOM at default 4GB heap limit"
  - "Entrypoint COPY from pruner stage -- scripts/ directory at monorepo root not included in turbo prune output"
  - "Worker working_dir: /app/apps/api -- tsx module resolution requires CWD to be in workspace with tsx dependency"

patterns-established:
  - "Production Docker: docker compose -f docker-compose.prod.yml up -d deploys everything"
  - "Service dependency chain: postgres+redis (healthy) -> api+worker -> web"
  - "Worker reuses API image with overridden entrypoint and working_dir"

# Metrics
duration: 35min
completed: 2026-02-16
---

# Phase 10 Plan 03: Docker Compose Production Stack Summary

**Production docker-compose.prod.yml with 5 services (postgres, redis, api, web, worker), verified full-stack deployment with auto-migrations, tsx/esm runtime loader for TypeScript workspace packages**

## Performance

- **Duration:** 35 min
- **Started:** 2026-02-16T20:31:43Z
- **Completed:** 2026-02-16T21:07:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- docker-compose.prod.yml orchestrates all 5 services with health checks, dependency ordering, and named volumes
- Full stack builds and starts with `docker compose -f docker-compose.prod.yml up -d`
- API auto-runs Prisma migrations on startup, serves /health endpoint
- Worker has git available for repo operations, both agent and merge workers start
- Web serves Next.js frontend on port 3009 with standalone output
- Resolved 5 Docker build/runtime issues: PNPM_HOME, tsc OOM, missing tsconfig, missing Prisma client, TypeScript workspace resolution

## Task Commits

Each task was committed atomically:

1. **Task 1: Create .dockerignore, docker-compose.prod.yml, and update .env.example** - `25df6b8` (feat) -- completed in prior session
2. **Task 2: Verify production Docker build and startup (build fixes)** - `835b683` (fix)

## Files Created/Modified
- `docker-compose.prod.yml` - Production compose with 5 services, health checks, volumes, env_file
- `.dockerignore` - Excludes node_modules, .next, dist, generated, .git, .env from Docker context
- `.env.example` - All production variables with required/optional sections
- `package.json` - docker:prod:build/up/down/logs scripts
- `apps/api/Dockerfile` - Added PNPM_HOME, NODE_OPTIONS, tsconfig.json COPY, prisma generate, pruner-stage entrypoint COPY
- `apps/web/Dockerfile` - Added PNPM_HOME, NODE_OPTIONS, tsconfig.json COPY
- `scripts/docker-entrypoint-api.sh` - Changed to tsx/esm loader, CWD to apps/api

## Decisions Made
- **tsx/esm runtime loader:** The monorepo workspace packages (@techteam/database, @techteam/shared) export raw TypeScript source files. In development, tsx handles this transparently. For production Docker, `node --import tsx/esm` registers tsx as an ESM loader, allowing the compiled API JS to import uncompiled TS workspace packages. This avoids needing to build every workspace package separately.
- **Prisma generate during Docker build:** The .dockerignore correctly excludes `generated/` (host-generated binaries are for Windows, not Alpine Linux). The Dockerfile runs prisma generate with a dummy DATABASE_URL during the build to create the Alpine-native Prisma client.
- **Worker working_dir:** Set to `/app/apps/api` so Node.js can find the tsx package in the local node_modules. Without this, the root /app has no tsx (pnpm strict hoisting).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PNPM_HOME not set for global turbo install**
- **Found during:** Task 2 (Docker build)
- **Issue:** pnpm 10.x requires PNPM_HOME env var for `pnpm add -g`, failing with ERR_PNPM_NO_GLOBAL_BIN_DIR
- **Fix:** Added `ENV PNPM_HOME="/pnpm"` and `ENV PATH="$PNPM_HOME:$PATH"` in pruner stage of both Dockerfiles
- **Files modified:** apps/api/Dockerfile, apps/web/Dockerfile
- **Verification:** turbo installed successfully globally
- **Committed in:** 835b683

**2. [Rule 3 - Blocking] tsc runs out of memory (OOM) during Docker build**
- **Found during:** Task 2 (Docker build)
- **Issue:** TypeScript compilation hit Node.js default ~4GB heap limit (exit code 137/OOM killed)
- **Fix:** Added `ENV NODE_OPTIONS="--max-old-space-size=8192"` in builder stage
- **Files modified:** apps/api/Dockerfile, apps/web/Dockerfile
- **Verification:** tsc completes in 4 seconds without OOM
- **Committed in:** 835b683

**3. [Rule 3 - Blocking] Root tsconfig.json not included in turbo prune output**
- **Found during:** Task 2 (Docker build)
- **Issue:** turbo prune `out/full/` only contains workspace packages; workspace tsconfigs extend `../../tsconfig.json` which was missing, causing esModuleInterop and module resolution errors
- **Fix:** Added `COPY tsconfig.json tsconfig.json` in builder stage of both Dockerfiles
- **Files modified:** apps/api/Dockerfile, apps/web/Dockerfile
- **Verification:** tsc compiles without type errors
- **Committed in:** 835b683

**4. [Rule 3 - Blocking] Prisma generated client missing in Docker build**
- **Found during:** Task 2 (Docker build)
- **Issue:** .dockerignore excludes `generated/` directory (correct for excluding Windows binaries), but Prisma client needed for tsc compilation and runtime
- **Fix:** Added `RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm --filter @techteam/database exec prisma generate` in builder stage
- **Files modified:** apps/api/Dockerfile
- **Verification:** Prisma Client (7.4.0) generated successfully for Alpine
- **Committed in:** 835b683

**5. [Rule 3 - Blocking] Entrypoint script not found in runner stage**
- **Found during:** Task 2 (Docker build)
- **Issue:** `scripts/docker-entrypoint-api.sh` at monorepo root is not in turbo prune output; COPY from builder stage failed
- **Fix:** Changed COPY to source from pruner stage: `COPY --from=pruner /app/scripts/docker-entrypoint-api.sh /entrypoint.sh`
- **Files modified:** apps/api/Dockerfile
- **Verification:** Build completes, entrypoint script available in runner
- **Committed in:** 835b683

**6. [Rule 1 - Bug] Workspace TypeScript packages not resolvable by plain node**
- **Found during:** Task 2 (Docker startup)
- **Issue:** @techteam/database exports raw .ts files; compiled API JS imports them but `node` cannot resolve .ts modules, causing ERR_MODULE_NOT_FOUND
- **Fix:** Changed entrypoint to use `node --import tsx/esm` for TypeScript resolution; set worker working_dir to /app/apps/api for tsx module access
- **Files modified:** scripts/docker-entrypoint-api.sh, docker-compose.prod.yml
- **Verification:** API and worker start successfully, all services running
- **Committed in:** 835b683

---

**Total deviations:** 6 auto-fixed (5 blocking, 1 bug)
**Impact on plan:** All fixes were necessary to make the Docker build and runtime work. These are standard Docker + monorepo integration issues discovered during the verification task. No scope creep.

## Issues Encountered
- The first build attempt ran for ~3 minutes before OOM kill -- NODE_OPTIONS increase resolved this permanently
- Multiple iterative fix cycles needed (6 separate issues surfaced one at a time as each was resolved)
- The tsx/esm runtime approach works but adds ~200ms startup overhead; a future optimization could bundle the API with esbuild to eliminate this

## User Setup Required

None - no external service configuration required. The .env file with POSTGRES_PASSWORD and BETTER_AUTH_SECRET is sufficient.

## Next Phase Readiness
- Full Docker deployment verified and working
- Phase 10 (Docker Deploy) is complete: all 3 plans executed
- Ready for Phase 11 (Pipeline E2E) -- the deployed stack can be tested end-to-end
- Resolved STATE.md blockers: "Prisma binary targets for Alpine Docker" (prisma generate handles this) and "Next.js standalone + monorepo" (outputFileTracingRoot works)

## Self-Check: PASSED

- [x] docker-compose.prod.yml - FOUND
- [x] .dockerignore - FOUND
- [x] .env.example - FOUND
- [x] apps/api/Dockerfile - FOUND
- [x] apps/web/Dockerfile - FOUND
- [x] scripts/docker-entrypoint-api.sh - FOUND
- [x] package.json - FOUND
- [x] Commit 25df6b8 - FOUND
- [x] Commit 835b683 - FOUND
- [x] 10-03-SUMMARY.md - FOUND

---
*Phase: 10-docker-deploy*
*Completed: 2026-02-16*
