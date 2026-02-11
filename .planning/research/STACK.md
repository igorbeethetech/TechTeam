# Technology Stack

**Project:** TechTeam Platform (AI Agent Orchestration)
**Researched:** 2026-02-11
**Overall Confidence:** MEDIUM

> **Research Limitations:** WebSearch and WebFetch were unavailable during research. Version numbers and best practices are based on training data (January 2025 cutoff) and cannot be verified against current 2026 official documentation. Treat version recommendations as starting points requiring validation.

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Next.js** | 15.x | Frontend application with SSR/SSG | Production-grade React framework with App Router, Server Components, and built-in optimization. Industry standard for dashboard UIs. |
| **Fastify** | 5.x | Backend API server | Fastest Node.js web framework (~20% faster than Express), schema-based validation, TypeScript-first, WebSocket support via `@fastify/websocket` for future real-time features. |
| **Node.js** | 20.x LTS or 22.x | Runtime environment | LTS version for production stability. Version 20 stable until 2026-04-30, Version 22 LTS from 2024-10-29. |
| **TypeScript** | 5.7+ | Type system | End-to-end type safety across monorepo. Required for Prisma type generation and shared validation. |

**Confidence:** MEDIUM (versions based on training data, Next.js 15 confirmed by user)

### Database & Persistence

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **PostgreSQL** | 16.x | Primary database | Industry standard for multi-tenant SaaS. Row-level security (RLS) support, JSONB for flexible metadata, excellent Prisma support. |
| **Prisma** | 6.x | ORM and schema management | Type-safe database access, multi-tenant filtering via middleware, migration system, single schema.prisma at monorepo root. |
| **Redis** | 7.x | Cache and BullMQ backend | In-memory store for job queue persistence, caching, and future session management. |

**Confidence:** MEDIUM (PostgreSQL 16 released 2023, Redis 7 released 2022, Prisma versions require verification)

### Job Queue & Orchestration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **BullMQ** | 5.x | Job queue for agent execution | Redis-backed job queue with concurrency control (max 3 concurrent Development jobs), automatic retries, job prioritization, and progress tracking. Better than Bull (deprecated) or Agenda (MongoDB-dependent). |
| **@anthropic-ai/sdk** | Latest | Claude API client | Official SDK for Claude API calls from agents. Required for agent execution. |

**Confidence:** MEDIUM (BullMQ actively maintained, version requires verification)

### Monorepo Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Turborepo** | 2.x | Monorepo build system | Caches builds across apps/packages, parallel task execution, remote caching support. Better DX than Nx for simple TypeScript monorepos. |
| **pnpm** | 9.x | Package manager | Faster installs, workspace protocol for monorepo, efficient disk usage. Better than npm/yarn for monorepos. |

**Workspace Structure:**
```
apps/web       → Next.js frontend
apps/api       → Fastify backend
packages/shared → Shared types, Zod schemas, Prisma client
```

**Confidence:** MEDIUM (Turborepo 2.x requires verification, pnpm 9 likely stable by early 2026)

### UI & Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Tailwind CSS** | 4.x | Utility-first CSS framework | Rapid UI development, purges unused CSS, design system consistency. Version 4 introduced oxide engine for performance. |
| **shadcn/ui** | Latest (not versioned) | Component library | Copy-paste component library (not npm package), built on Radix UI primitives, full customization, accessible by default. |
| **@dnd-kit** | 6.x | Drag-and-drop for Kanban | Lightweight, accessible, touch-friendly drag-and-drop. Better performance than react-beautiful-dnd (deprecated). |
| **Radix UI** | Latest | Headless UI primitives | Used by shadcn/ui. Accessible, unstyled components for dialogs, dropdowns, popovers. |

**Confidence:** MEDIUM (Tailwind 4 released late 2024/early 2025, @dnd-kit versions require verification)

### Data Fetching & State

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **TanStack Query** (React Query) | 5.x | Server state management | Polling-first data fetching (refetchInterval), optimistic updates, cache management. Better than SWR for complex invalidation patterns. |
| **Zod** | 3.x | Schema validation | Shared validation schemas in `packages/shared`, runtime type safety, Prisma integration via `zod-prisma-types`. |
| **Zustand** | 5.x | Client state (optional) | Lightweight state for UI state (filters, modals). Use sparingly—TanStack Query handles most state. |

**Confidence:** MEDIUM (TanStack Query v5 released, Zod stable, versions require verification)

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **ESLint** | Linting | Shared config in `packages/eslint-config` with Next.js and Fastify presets |
| **Prettier** | Code formatting | Shared config at monorepo root |
| **tsx** | TypeScript execution | Run TypeScript files directly (better than ts-node) |
| **Vitest** | Unit testing | Faster than Jest, Vite-powered, ESM-native |
| **Playwright** | E2E testing | Cross-browser testing for dashboard flows |

**Confidence:** MEDIUM (standard tooling, versions require verification)

### Infrastructure (Development)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Docker Compose** | Latest | Local PostgreSQL + Redis | Consistent dev environment, no global installs required |
| **Claude CLI** | Latest | Agent execution via headless mode | `claude -p` for programmatic agent execution, JSON output for orchestration |

**Confidence:** MEDIUM (Docker Compose stable, Claude CLI headless mode confirmed by user)

## Supporting Libraries

### Backend (Fastify)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/cors` | Latest | CORS headers | Required for Next.js dev server connecting to Fastify API |
| `@fastify/helmet` | Latest | Security headers | Always use in production |
| `@fastify/jwt` | Latest | JWT authentication | User auth tokens |
| `@fastify/websocket` | Latest | WebSocket support | Future real-time updates (deferred in MVP) |
| `@fastify/env` | Latest | Environment validation | Type-safe env vars with Zod schemas |
| `pino` | Latest | Logging | Default Fastify logger, JSON structured logs |

### Frontend (Next.js)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-hook-form` | Latest | Form management | Complex forms (project creation, demand editing) |
| `date-fns` | Latest | Date formatting | Agent execution timestamps, relative dates |
| `clsx` / `tailwind-merge` | Latest | Class name utilities | Conditional Tailwind classes (via `cn()` helper) |
| `lucide-react` | Latest | Icons | Consistent icon set (used by shadcn/ui) |

### Shared Packages

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@prisma/client` | Matches Prisma version | Database client | Generated from schema, exported from `packages/shared` |
| `zod` | 3.x | Validation schemas | DTOs, API payloads, form validation |

**Confidence:** LOW-MEDIUM (library versions require verification with official docs)

## Installation

```bash
# Monorepo setup
pnpm install

# Initialize Prisma
cd packages/shared
pnpm prisma generate
pnpm prisma migrate dev --name init

# Docker containers (PostgreSQL + Redis)
docker-compose up -d

# Development (parallel execution)
pnpm dev
```

**Package Installation (reference only - managed via workspace):**
```bash
# Backend dependencies (apps/api)
pnpm add fastify @fastify/cors @fastify/helmet @fastify/jwt @fastify/env
pnpm add @anthropic-ai/sdk bullmq ioredis pino
pnpm add -D @types/node tsx

# Frontend dependencies (apps/web)
pnpm add @tanstack/react-query @dnd-kit/core @dnd-kit/sortable
pnpm add react-hook-form date-fns clsx tailwind-merge lucide-react
pnpm add -D tailwindcss autoprefixer

# Shared dependencies (packages/shared)
pnpm add @prisma/client zod
pnpm add -D prisma
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **Frontend** | Next.js 15 | Remix, Astro | Next.js has better ecosystem for dashboard UIs, RSC support, and proven SaaS track record |
| **Backend** | Fastify | Express, Hono | Express is slower and legacy (2009), Hono is edge-focused (not needed), Fastify is production-proven with TypeScript-first DX |
| **ORM** | Prisma | Drizzle, TypeORM | Drizzle lacks migration maturity, TypeORM has weaker TypeScript inference, Prisma has best multi-tenant patterns |
| **Job Queue** | BullMQ | Agenda, Bee-Queue | Agenda uses MongoDB (mismatch), Bee-Queue lacks features (no job prioritization), BullMQ is industry standard |
| **DnD Library** | @dnd-kit | react-beautiful-dnd | react-beautiful-dnd is deprecated (last update 2021), @dnd-kit is actively maintained and performant |
| **State Management** | TanStack Query + Zustand | Redux, Jotai, Recoil | Redux is overkill for this app, Jotai/Recoil have smaller ecosystems, TanStack Query handles server state better |
| **Monorepo** | Turborepo | Nx, Lerna | Nx is heavier (unnecessary features), Lerna is maintenance mode, Turborepo has best Vercel integration and caching |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Bull** (job queue) | Deprecated, replaced by BullMQ | **BullMQ** (official successor) |
| **react-beautiful-dnd** | Unmaintained since 2021, no React 18 support | **@dnd-kit** (modern, maintained) |
| **SWR** | Weaker cache invalidation, no polling interval per query | **TanStack Query** (more features) |
| **TypeORM** | Decorator-based (runtime overhead), weaker inference | **Prisma** (type-safe, migration system) |
| **ts-node** | Slow startup, ESM issues | **tsx** (fast, ESM-native) |
| **Jest** | Slower, CJS-first | **Vitest** (faster, ESM-first) |
| **yarn** (v1) | Legacy, slower than pnpm | **pnpm** (faster, workspace-native) |

## Stack Patterns by Variant

### Multi-Tenant Filtering (Prisma Middleware)

**Pattern:** Global `tenantId` filter injected via Prisma middleware

```typescript
// packages/shared/src/prisma.ts
import { PrismaClient } from '@prisma/client'

export const createPrismaClient = (tenantId: string) => {
  const prisma = new PrismaClient()

  prisma.$use(async (params, next) => {
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args.where = { ...params.args.where, tenantId }
    }
    return next(params)
  })

  return prisma
}
```

**Use when:** Every database query (enforce at ORM level, not application level)

### Agent Execution (BullMQ Worker)

**Pattern:** Job queue with concurrency control per project

```typescript
// apps/api/src/workers/agent-worker.ts
import { Worker } from 'bullmq'
import { exec } from 'child_process'

const worker = new Worker('agent-queue', async (job) => {
  const { phase, demandId, projectId } = job.data

  // Execute Claude CLI in headless mode
  const output = await execPromise(
    `claude -p "Execute ${phase} for demand ${demandId}"`
  )

  return JSON.parse(output)
}, {
  connection: redisConnection,
  concurrency: 3 // Max 3 concurrent Development jobs
})
```

**Use when:** Orchestrating Claude agents via `claude -p`

### Polling-First Data Fetching

**Pattern:** TanStack Query with refetch interval, degrade gracefully

```typescript
// apps/web/src/hooks/useDemands.ts
import { useQuery } from '@tanstack/react-query'

export const useDemands = (projectId: string) => {
  return useQuery({
    queryKey: ['demands', projectId],
    queryFn: () => fetchDemands(projectId),
    refetchInterval: 5000, // Poll every 5s
    staleTime: 3000
  })
}
```

**Use when:** MVP phase (WebSocket migration is future phase)

## Version Compatibility

**Critical Compatibility Notes:**

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Prisma 6.x | PostgreSQL 12+ | Requires PostgreSQL 12+ for generated columns |
| BullMQ 5.x | Redis 6.2+ | Requires Redis 6.2+ for stream commands |
| Next.js 15 | React 19 | Next.js 15 requires React 19 (canary during research) |
| Fastify 5.x | Node.js 20+ | Requires Node.js 20 LTS minimum |
| pnpm 9.x | Node.js 18+ | Works with Node.js 18+, but use 20 LTS for backend |

**Monorepo Package Version Constraints:**

```json
// package.json (root)
{
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.x"
}
```

## Multi-Tenant Architecture Specifics

### Database Schema Pattern

```prisma
// packages/shared/prisma/schema.prisma
model Tenant {
  id        String   @id @default(cuid())
  name      String
  projects  Project[]
  users     User[]
}

model Project {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  demands   Demand[]

  @@index([tenantId])
}

model Demand {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id])

  // Implicit tenantId via project.tenantId (no duplication)
}
```

**Pattern:** `tenantId` at top-level entities (Tenant, Project, User), implicit filtering via relations

### Authentication Flow

```
User login → JWT with tenantId claim → Fastify decorator injects tenantId → Prisma middleware filters
```

**Libraries:**
- `@fastify/jwt` for token generation/validation
- Custom Fastify decorator for `request.tenantId`
- Prisma middleware for automatic filtering

## Production Deployment Considerations

**Deferred to Future Phases (per PROJECT.md):**
- VPS deployment (start local, containerize later)
- WebSocket real-time updates (polling first)
- Horizontal scaling (single instance MVP)

**Required for MVP:**
- Environment variable validation (`@fastify/env` + Zod)
- Database connection pooling (Prisma default: 10 connections)
- Redis persistence (AOF + RDB for BullMQ durability)
- Error tracking (consider Sentry in post-MVP)

## Sources

**Primary:**
- User-provided project context (`PROJECT.md`) — HIGH confidence for stack decisions
- Training data (January 2025 cutoff) — MEDIUM confidence for library versions

**Limitations:**
- WebSearch unavailable — could not verify 2026 current versions
- WebFetch unavailable — could not check official documentation
- Context7 not used — no MCP library queries performed

**Recommended Validation:**
- Verify Next.js 15 release status and stability in 2026
- Check Prisma 6.x compatibility with PostgreSQL 16
- Validate BullMQ 5.x current version and Redis requirements
- Confirm Turborepo 2.x stability and pnpm 9.x release status

**Action Required:**
Before implementation, validate all version numbers against official documentation:
- https://nextjs.org/docs
- https://fastify.dev/docs/latest/
- https://www.prisma.io/docs
- https://docs.bullmq.io/
- https://turbo.build/repo/docs

---

*Stack research for: AI Agent Orchestration Platform*
*Researched: 2026-02-11*
*Confidence: MEDIUM (versions require 2026 validation)*
