# Phase 10: Docker Production Deploy - Research

**Researched:** 2026-02-15
**Domain:** Docker multi-stage builds, container orchestration, monorepo containerization
**Confidence:** HIGH

## Summary

This phase containerizes the entire TechTeam platform (API, web, worker, PostgreSQL, Redis) for single-command VPS deployment via `docker compose up -d`. The project is a pnpm + Turborepo monorepo with Fastify 5 API, Next.js 15 frontend, BullMQ workers, Prisma 7 ORM, PostgreSQL 16, and Redis 7.

The primary technical challenge is creating efficient multi-stage Docker builds that leverage `turbo prune --docker` to produce minimal images from the monorepo. A critical finding is that **Prisma 7 with the `prisma-client` generator and `@prisma/adapter-pg` driver adapter does NOT use Rust query engine binaries** -- this eliminates the previously flagged `binaryTargets` concern for Alpine containers entirely. The project already uses this architecture (`generator client { provider = "prisma-client" }` with `PrismaPg` adapter).

The worker container requires special attention: it spawns either the Claude Agent SDK (npm package) or the Claude CLI (`claude` binary) as subprocesses, and needs `git` installed for repository operations via `simple-git`. The API TypeScript build also requires adjustment -- `worker.ts` sits outside the `src/` directory and the current `tsconfig.json` only compiles `src/`, meaning either the tsconfig needs updating or a separate build configuration is needed for the worker entrypoint.

**Primary recommendation:** Use three-stage Dockerfiles (prune, build, run) with `turbo prune --docker` and `node:22-alpine` as base image. Run migrations via an entrypoint script on the API container before starting the server. Keep API and worker as separate containers with different CMD instructions but the same base image build.

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| node:22-alpine | 22.x | Base Docker image | Matches project engine requirement (>=22.0.0); Alpine for minimal image size; required by Prisma 7 |
| turbo | ^2.8.0 | Monorepo build tool / pruning | Already in project; `turbo prune --docker` creates optimal Docker layer caching |
| pnpm | 10.28.2 | Package manager | Already in project via `packageManager` field; enabled via corepack in Docker |
| Docker Compose | v2 | Container orchestration | Already used for dev; extending to production services |
| postgres:16-alpine | 16.x | Database | Already in dev compose; same image for production |
| redis:7-alpine | 7.x | Queue/PubSub backend | Already in dev compose; same image for production |

### Supporting
| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| @anthropic-ai/claude-code | latest | Claude CLI for worker | Only in worker container when CLI execution mode is needed |
| git (apk package) | latest | Git operations in worker | Required by simple-git for repo cloning/branching in worker container |
| openssl (apk package) | latest | TLS/SSL support | May be needed in Alpine for database SSL connections |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Alpine images | Debian slim images | Larger image but fewer musl compatibility issues; Alpine is fine since Prisma 7 no longer needs native binaries |
| turbo prune | pnpm deploy --filter | turbo prune handles lockfile pruning and Docker layer optimization better for Turborepo monorepos |
| Separate Dockerfiles per app | Single multi-target Dockerfile | Separate files are clearer and easier to maintain for different container requirements |

## Architecture Patterns

### Recommended Project Structure for Docker
```
/ (monorepo root)
+-- apps/api/Dockerfile              # Multi-stage: API server
+-- apps/web/Dockerfile              # Multi-stage: Next.js standalone
+-- docker-compose.yml               # Dev (existing, keep as-is)
+-- docker-compose.prod.yml          # Production: all services
+-- .env.example                     # Template with all production vars
+-- scripts/
|   +-- docker-entrypoint-api.sh     # Runs migrations then starts API
```

### Pattern 1: Turbo Prune Three-Stage Dockerfile (API)
**What:** Multi-stage Docker build using turbo prune for monorepo optimization
**When to use:** For every app in the monorepo that needs its own Docker image

```dockerfile
# Source: https://turborepo.dev/docs/guides/tools/docker
# Stage 1: Prune monorepo to only include @techteam/api and its dependencies
FROM node:22-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Install turbo globally for pruning
RUN pnpm add -g turbo@^2
COPY . .
RUN turbo prune @techteam/api --docker

# Stage 2: Install dependencies and build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Copy pruned package.json files first (Docker cache layer for deps)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile
# Copy full source and build
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
RUN pnpm turbo build --filter=@techteam/api...

# Stage 3: Production runner
FROM node:22-alpine AS runner
RUN apk add --no-cache git openssl
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
# Copy built output and production node_modules
COPY --from=builder --chown=appuser:nodejs /app/ .
USER appuser
EXPOSE 3010
CMD ["node", "apps/api/dist/server.js"]
```

### Pattern 2: Next.js Standalone Build (Web)
**What:** Next.js with `output: 'standalone'` for minimal production image
**When to use:** For the web frontend container

```typescript
// apps/web/next.config.ts -- MUST be updated for Docker
import type { NextConfig } from "next"
import path from "node:path"

const nextConfig: NextConfig = {
  output: "standalone",
  // CRITICAL for monorepo: trace from monorepo root, not just apps/web
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  transpilePackages: ["@techteam/shared"],
}

export default nextConfig
```

```dockerfile
# Runner stage for Next.js standalone
FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
ENV HOSTNAME="0.0.0.0"
ENV PORT=3009
EXPOSE 3009
CMD ["node", "apps/web/server.js"]
```

### Pattern 3: Migration Entrypoint Script
**What:** Run Prisma migrations before starting the API server
**When to use:** On API container startup

```bash
#!/bin/sh
# scripts/docker-entrypoint-api.sh
set -e

echo "[entrypoint] Running database migrations..."
cd /app/packages/database
npx prisma migrate deploy
echo "[entrypoint] Migrations complete."

echo "[entrypoint] Starting API server..."
cd /app
exec node apps/api/dist/server.js
```

### Pattern 4: Worker Container (Same Build, Different CMD)
**What:** Worker uses same API image build but different entrypoint
**When to use:** For the BullMQ worker container

The worker container should be built from the same Dockerfile as the API (it uses the same codebase) but with a different `CMD`. In docker-compose.prod.yml:

```yaml
worker:
  build:
    context: .
    dockerfile: apps/api/Dockerfile
    target: runner
  command: ["node", "apps/api/dist/worker.js"]
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - REDIS_URL=${REDIS_URL}
    - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
```

### Anti-Patterns to Avoid
- **Installing all monorepo dependencies in Docker:** Always use `turbo prune` first. Without it, Docker copies the entire monorepo and installs all workspace dependencies.
- **Running `prisma migrate dev` in production:** Use `prisma migrate deploy` which only applies pending migrations without generating new ones.
- **Using `tsx` in production containers:** Always compile TypeScript to JavaScript. tsx adds startup overhead and memory usage.
- **Hardcoding env vars in Dockerfile:** All configuration must come from environment variables or the .env file, never baked into the image.
- **Using `npm install` instead of `pnpm install --frozen-lockfile`:** The lockfile must be respected for reproducible builds.
- **Forgetting `host: "0.0.0.0"` for Fastify:** The API already listens on `0.0.0.0` (confirmed in server.ts), but this is a common Docker pitfall -- servers must not bind to 127.0.0.1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Monorepo dependency isolation | Custom copy scripts for each workspace | `turbo prune --docker` | Handles lockfile pruning, workspace:* resolution, and proper dependency tree |
| Next.js production server | Custom Express/Fastify wrapper for Next.js | `output: 'standalone'` built-in | Next.js traces dependencies automatically; standalone includes minimal server.js |
| Database migration orchestration | Custom migration runner | `prisma migrate deploy` | Handles migration ordering, locks, idempotency, and history tracking |
| Service startup ordering | Custom wait scripts or sleep delays | Docker Compose `depends_on: condition: service_healthy` | Native healthcheck integration with proper retry/timeout semantics |
| Process signal handling | Custom signal handlers for Docker | Node.js built-in `process.on('SIGTERM')` | Worker already implements graceful shutdown correctly |

**Key insight:** Docker and the existing tools (turbo, prisma, next.js standalone, compose healthchecks) provide all the orchestration primitives needed. The work is configuration, not coding.

## Common Pitfalls

### Pitfall 1: turbo prune Lockfile Issues with pnpm
**What goes wrong:** `pnpm install --frozen-lockfile` fails after `turbo prune --docker` because the pruned lockfile is incomplete or missing checksums.
**Why it happens:** There are known issues between turbo prune and pnpm lockfile formats, especially with pnpm v9+ and features like `injectWorkspacePackages`. Multiple GitHub issues remain open on this topic.
**How to avoid:** Test the prune + install cycle locally first. If `--frozen-lockfile` fails, fall back to `pnpm install` without the frozen flag (less reproducible but functional). Pin turbo version to match what works with pnpm 10.28.2. Do NOT use `injectWorkspacePackages` in .npmrc.
**Warning signs:** CI/Docker build fails at `pnpm install --frozen-lockfile` step with "lockfile out of date" errors.

### Pitfall 2: Next.js Standalone Missing Workspace Packages
**What goes wrong:** `Cannot find module '@techteam/shared'` or similar when running the standalone server.
**Why it happens:** Without `outputFileTracingRoot` pointing to the monorepo root, Next.js traces only from `apps/web/` and misses packages outside that directory.
**How to avoid:** Set `outputFileTracingRoot: path.join(import.meta.dirname, "../../")` in next.config.ts. Verify after build that `.next/standalone/` contains the necessary workspace package files.
**Warning signs:** Build succeeds but runtime fails with module not found errors.

### Pitfall 3: Worker TypeScript Build -- worker.ts Outside src/
**What goes wrong:** `tsc` compiles only `src/` but `worker.ts` is at `apps/api/worker.ts`, so the worker entrypoint is not compiled.
**Why it happens:** The API tsconfig has `"rootDir": "src"` and `"include": ["src"]`, excluding the root-level worker.ts.
**How to avoid:** Either (a) move worker.ts into src/ (simplest), or (b) create a separate tsconfig for the worker build, or (c) adjust the existing tsconfig to include the root directory.
**Warning signs:** `dist/worker.js` does not exist after `tsc` build.

### Pitfall 4: Prisma Generated Client Not Available in Production Image
**What goes wrong:** `Cannot find module '../generated/prisma/client.js'` at runtime.
**Why it happens:** Prisma generate output is at `packages/database/generated/prisma/` which may not be properly copied to the production image, or generate was never run during the Docker build.
**How to avoid:** Ensure `prisma generate` runs as part of the build step inside Docker. The turbo `build` task should include this via the dependency chain. Verify the `generated/` directory exists in the built image.
**Warning signs:** Build succeeds, container crashes immediately on startup with module resolution error.

### Pitfall 5: dotenv Path Resolution in Docker
**What goes wrong:** Environment variables are undefined because dotenv tries to resolve `.env` relative to `__dirname` which doesn't match the Docker filesystem layout.
**Why it happens:** Both `packages/database/src/client.ts` and `apps/api/src/lib/config.ts` use `path.resolve(__dirname, "../../.env")` or similar relative paths to find the monorepo root .env file.
**How to avoid:** In production Docker, environment variables are injected via Docker Compose environment/env_file, NOT loaded from a .env file by dotenv. The code should fall back gracefully when the .env file doesn't exist (dotenv.config does this -- it doesn't throw if the file is missing). Verify that `process.env.DATABASE_URL` etc. are set by Docker, not by dotenv.
**Warning signs:** "Missing required environment variable" errors despite env vars being in docker-compose.

### Pitfall 6: Corepack Signature Validation Errors
**What goes wrong:** Docker build fails with "Corepack signature validation error" when trying to install pnpm.
**Why it happens:** Corepack's signature verification has known issues with certain pnpm versions.
**How to avoid:** Pin the exact pnpm version: `corepack prepare pnpm@10.28.2 --activate`. If signature issues persist, set `COREPACK_ENABLE_STRICT=0` as a workaround.
**Warning signs:** Build fails during the corepack/pnpm setup step before any application code runs.

### Pitfall 7: Claude CLI ENOENT in Docker
**What goes wrong:** Worker container spawning Claude CLI subprocess gets `spawn ENOENT` error.
**Why it happens:** Known issue (GitHub #14464, still open as of Feb 2026) where the Claude Agent SDK cannot find the claude binary in containerized environments even when it exists at the specified path.
**How to avoid:** The project already supports dual-mode execution (SDK vs CLI). In Docker, use the SDK mode (`@anthropic-ai/claude-agent-sdk` with `ANTHROPIC_API_KEY`) which doesn't spawn a subprocess. CLI mode can be used outside Docker. This is configurable per-tenant via `agentExecutionMode` setting.
**Warning signs:** Worker logs show "Claude CLI not found" or ENOENT errors.

### Pitfall 8: Missing git in Alpine Container
**What goes wrong:** Worker container fails with "git: not found" when simple-git tries to execute git commands.
**Why it happens:** Alpine images don't include git by default.
**How to avoid:** Add `RUN apk add --no-cache git` to the worker container Dockerfile stage.
**Warning signs:** Worker crashes on first repository operation.

## Code Examples

Verified patterns from official sources:

### Production docker-compose.prod.yml
```yaml
# Source: Docker Compose documentation + project analysis
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-techteam}
      POSTGRES_USER: ${POSTGRES_USER:-techteam}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-techteam}"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    command: redis-server --appendonly yes --maxmemory-policy noeviction
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "${API_PORT:-3010}:3010"
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-techteam}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-techteam}
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "${WEB_PORT:-3009}:3009"
    environment:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:3010}
    depends_on:
      - api
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    command: ["node", "apps/api/dist/worker.js"]
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-techteam}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-techteam}
      REDIS_URL: redis://redis:6379
    volumes:
      - repos:/app/repos
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  repos:
```

### Production .env Template
```bash
# Source: Project analysis of apps/api/src/lib/config.ts + apps/web/.env.local
# === Required ===
POSTGRES_PASSWORD=change_me_to_strong_password
BETTER_AUTH_SECRET=change_me_minimum_32_characters_long
ANTHROPIC_API_KEY=sk-ant-...

# === Optional (with defaults) ===
POSTGRES_DB=techteam
POSTGRES_USER=techteam
POSTGRES_PORT=5432
REDIS_PORT=6379
API_PORT=3010
WEB_PORT=3009
BETTER_AUTH_URL=http://localhost:3010
WEB_URL=http://localhost:3009
NEXT_PUBLIC_API_URL=http://localhost:3010
CLAUDE_MODEL=sonnet
GITHUB_TOKEN=
```

### API Dockerfile (Complete)
```dockerfile
# Source: Turborepo Docker guide + pnpm Docker guide + project analysis
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache libc6-compat

# Stage 1: Prune monorepo
FROM base AS pruner
WORKDIR /app
RUN pnpm add -g turbo@^2
COPY . .
RUN turbo prune @techteam/api --docker

# Stage 2: Install and build
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
# Generate Prisma client + build all packages
RUN pnpm turbo build --filter=@techteam/api...

# Stage 3: Production
FROM node:22-alpine AS runner
RUN apk add --no-cache git openssl
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy built application
COPY --from=builder --chown=appuser:nodejs /app .

# Copy entrypoint script
COPY --from=builder /app/scripts/docker-entrypoint-api.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER appuser
EXPOSE 3010
ENTRYPOINT ["/entrypoint.sh"]
```

### Web Dockerfile (Complete)
```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache libc6-compat

# Stage 1: Prune
FROM base AS pruner
WORKDIR /app
RUN pnpm add -g turbo@^2
COPY . .
RUN turbo prune @techteam/web --docker

# Stage 2: Build
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json

# Build args for Next.js public env vars (baked at build time)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm turbo build --filter=@techteam/web...

# Stage 3: Production
FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

ENV HOSTNAME="0.0.0.0"
ENV PORT=3009
EXPOSE 3009
CMD ["node", "apps/web/server.js"]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prisma binary engines (binaryTargets) | Prisma 7 driver adapters (no Rust engines) | Prisma 7 (2025) | No more Alpine binary target issues; simpler Docker builds |
| `prisma-client-js` generator | `prisma-client` generator | Prisma 7 (2025) | Must use driver adapter; no binaryTargets field needed |
| pnpm installed via npm | pnpm via corepack enable | Node 22+ | Built-in; no extra install step |
| Docker Compose v1 (docker-compose) | Docker Compose v2 (docker compose) | 2023 | Compose is now a Docker plugin; use `docker compose` not `docker-compose` |
| Custom wait-for scripts | depends_on + service_healthy | Docker Compose v2 | Native healthcheck-based dependency ordering |
| Next.js standalone manual dependency bundling | outputFileTracingRoot for monorepos | Next.js 13+ | Correct monorepo tracing; files outside app dir included |

**Deprecated/outdated:**
- `prisma-client-js` generator: Deprecated in Prisma 7. Use `prisma-client` instead.
- `binaryTargets` in schema.prisma: Not needed with Prisma 7 + driver adapters. The project already uses this architecture.
- Docker Compose v1 `docker-compose` CLI: Use `docker compose` (v2 plugin) instead.

## Open Questions

1. **turbo prune + pnpm 10 lockfile reliability**
   - What we know: Multiple open GitHub issues about turbo prune producing broken lockfiles with recent pnpm versions. The project uses pnpm 10.28.2 and turbo ^2.8.0.
   - What's unclear: Whether the specific combination of pnpm 10.28.2 + turbo 2.8.x produces valid pruned lockfiles.
   - Recommendation: Test `turbo prune @techteam/api --docker` locally first. If `--frozen-lockfile` fails, use `pnpm install` (without frozen). This is a build-time concern, not a runtime concern.

2. **worker.ts build path**
   - What we know: worker.ts is at `apps/api/worker.ts` but tsconfig rootDir is `src/`. The tsc build currently does not compile worker.ts.
   - What's unclear: Whether moving worker.ts into src/ would break the import paths or dev:worker script.
   - Recommendation: Move worker.ts to `apps/api/src/worker.ts` and update the dev:worker script. This is the simplest fix. Alternatively, update tsconfig to include the root directory.

3. **Claude CLI in Docker worker**
   - What we know: Known ENOENT spawn issue (GitHub #14464, open as of Feb 2026). The project supports both SDK and CLI execution modes.
   - What's unclear: Whether the SDK mode works reliably in Docker containers without issues.
   - Recommendation: Default Docker deployment to SDK mode (using ANTHROPIC_API_KEY). Do not install Claude CLI in the Docker image unless specifically needed. Document that CLI mode is for local/non-containerized environments.

4. **NEXT_PUBLIC_API_URL at build time vs runtime**
   - What we know: Next.js `NEXT_PUBLIC_*` vars are baked in at build time. The current .env.local has `NEXT_PUBLIC_API_URL=http://localhost:3010`.
   - What's unclear: Whether the production API URL is known at build time or needs to be configurable at runtime.
   - Recommendation: Pass `NEXT_PUBLIC_API_URL` as a Docker build arg. For runtime flexibility, the API URL could also be loaded via a runtime config endpoint, but that adds complexity. Build-time is simpler for VPS deployments where the domain is known.

5. **Repo volume mount for worker**
   - What we know: Worker needs access to git repositories for clone/branch/push operations. Repository paths are stored in the `project.repoPath` database column.
   - What's unclear: Whether repos should be stored in a Docker volume or a host bind mount.
   - Recommendation: Use a named Docker volume (`repos:`) mounted at a consistent path (e.g., `/app/repos`). Ensure project repoPath values in the database match this container path.

## Sources

### Primary (HIGH confidence)
- [Turborepo Docker guide](https://turborepo.dev/docs/guides/tools/docker) - turbo prune --docker pattern, multi-stage build structure
- [Turborepo prune reference](https://turborepo.dev/docs/reference/prune) - --docker flag output structure
- [pnpm Docker guide](https://pnpm.io/docker) - corepack setup, pnpm fetch, multi-stage patterns
- [Next.js output: standalone docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) - outputFileTracingRoot, monorepo caveats, standalone server
- [Prisma Docker guide](https://www.prisma.io/docs/guides/docker) - Alpine support, migrate deploy, Node 22 requirement
- [Prisma no-Rust-engine docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/no-rust-engine) - Driver adapter architecture, no binaryTargets needed
- [Prisma 7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7) - prisma-client generator, breaking changes
- [Claude Agent SDK hosting docs](https://platform.claude.com/docs/en/agent-sdk/hosting) - Container deployment patterns, system requirements
- [Anthropic Claude Code Dockerfile](https://github.com/anthropics/claude-code/blob/main/.devcontainer/Dockerfile) - Official Docker setup for Claude CLI

### Secondary (MEDIUM confidence)
- [BullMQ connections docs](https://docs.bullmq.io/guide/connections) - Worker connection configuration, separate process pattern
- [Docker Compose services reference](https://docs.docker.com/reference/compose-file/services/) - depends_on, healthcheck, env_file
- [Turborepo Next.js Dockerfile example](https://www.bstefanski.com/blog/turborepo-nextjs-dockerfile) - Complete working pnpm + turbo + Next.js Dockerfile

### Tertiary (LOW confidence, needs validation)
- [Claude Code ENOENT issue #14464](https://github.com/anthropics/claude-code/issues/14464) - Spawn ENOENT in Docker (open, unresolved)
- [turbo prune + pnpm lockfile issues](https://github.com/vercel/turborepo/issues/10584) - Ongoing compatibility concerns
- [Corepack signature validation issues](https://github.com/payloadcms/payload/issues/11037) - pnpm install via corepack failures

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All technologies already in the project; versions verified against package.json
- Architecture: HIGH - turbo prune + multi-stage Docker is the documented, standard pattern from Turborepo official docs
- Pitfalls: HIGH - Major pitfalls verified against official docs and GitHub issues; Prisma 7 binary target non-issue confirmed
- turbo prune + pnpm compatibility: MEDIUM - Known issues exist but project does not use problematic features (no injectWorkspacePackages)
- Claude CLI in Docker: LOW - Open issue, recommend SDK mode workaround

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days -- stable technologies, minor risk from turbo/pnpm compatibility updates)
