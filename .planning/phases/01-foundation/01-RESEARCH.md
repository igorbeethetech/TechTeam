# Phase 1: Foundation - Research

**Researched:** 2026-02-11
**Domain:** Monorepo scaffolding, database setup, authentication, multi-tenant isolation, project CRUD
**Confidence:** HIGH

## Summary

Phase 1 establishes the entire platform foundation: a Turborepo monorepo with Next.js frontend and Fastify backend, PostgreSQL with Prisma ORM, Docker Compose for local services, authentication with session persistence, multi-tenant data isolation, and full project CRUD. This is the most critical phase because every subsequent phase builds on these foundations -- a mistake here (especially in tenant isolation or auth) propagates everywhere.

The research uncovered several version updates since the initial domain research was done. Most critically: **Prisma 7 is the current version** (not 6.x), and it has major breaking changes including removal of the `$use()` middleware API. The old research documents recommending Prisma middleware for multi-tenant filtering are outdated. The correct approach is Prisma Client Extensions with query components. Additionally, **pnpm 10.x** is current (not 9.x), **Turborepo 2.8.x** is current, **Node.js 22 LTS** is the recommended runtime (24 is Active LTS but too new for ecosystem compatibility), and **Next.js 15.x** remains the recommended choice for stability (16.x is available but the user's design doc specifies Next.js 15).

For authentication, the design document mentions "Better Auth ou Lucia". Lucia has been deprecated (the author archived the project and recommends rolling your own). **Better Auth** is the clear winner -- it has a Fastify integration, Prisma adapter, organization plugin for multi-tenancy, cookie-based sessions with persistence, and handles password hashing internally. It has resolved its Prisma 7 peer dependency issue as of December 2025.

**Primary recommendation:** Use Prisma 7 with Client Extensions (not middleware) for tenant isolation, Better Auth with organization plugin for authentication and session management, and keep all version selections aligned to what is verified as current and stable in February 2026.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22.x LTS | Runtime | Active LTS until 2027-04-30. Prisma 7 requires >=20.19.0. Node 22 is the stable sweet spot. |
| TypeScript | 5.7+ | Type system | Prisma 7 requires >=5.4.0. End-to-end type safety across monorepo. |
| Turborepo | 2.8.x | Monorepo build system | Current stable. Parallel task execution, build caching, workspace-aware. |
| pnpm | 10.x | Package manager | Current stable (10.29.2). Workspace protocol for monorepo, faster than npm/yarn. |
| Next.js | 15.x | Frontend (App Router) | User-specified in design doc. Stable, production-ready. (16.x exists but user chose 15.) |
| Fastify | 5.7.x | Backend API server | Current stable. Fastest Node.js framework, TypeScript-first, plugin ecosystem. |
| Prisma | 7.3.x | ORM + migrations | Current stable. BREAKING: Now requires driver adapters, prisma.config.ts, ESM, new generator. Middleware removed -- use Client Extensions. |
| PostgreSQL | 16.x | Primary database | Stable, mature. Used with @prisma/adapter-pg driver adapter. |
| Redis | 7.x | Cache + BullMQ backend | Required for BullMQ in later phases. Set up in Docker Compose now. |
| Better Auth | latest | Authentication framework | Replaces manual @fastify/jwt. Handles register, login, logout, sessions, password hashing, organization/multi-tenant. Has Prisma adapter and Fastify integration. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @prisma/adapter-pg | latest | Prisma PostgreSQL driver | Required in Prisma 7 -- connects Prisma Client to PostgreSQL |
| pg | latest | Node.js PostgreSQL client | Required by @prisma/adapter-pg |
| @fastify/cors | latest | CORS headers | Required for Next.js dev server connecting to Fastify API |
| @fastify/cookie | latest | Cookie support | Required for Better Auth session cookies |
| Tailwind CSS | 4.x | Utility-first CSS | Current stable (4.1). Major rewrite with better performance. |
| shadcn/ui | latest | Component library | Copy-paste components built on Radix UI. Updated for Tailwind v4 and React 19. |
| @tanstack/react-query | 5.x | Server state management | Current stable (5.90.x). Polling for data fetching, cache management. |
| Zod | 3.x | Schema validation | Shared validation between frontend and backend via packages/shared |
| react-hook-form | latest | Form management | Project creation, auth forms |
| @hookform/resolvers | latest | Zod integration for forms | Connect Zod schemas to react-hook-form |
| lucide-react | latest | Icons | Used by shadcn/ui |
| clsx + tailwind-merge | latest | Class name utilities | cn() helper for conditional Tailwind classes |
| dotenv | latest | Environment variables | Required by Prisma 7 (no longer auto-loaded) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Better Auth | @fastify/jwt (manual) | Manual JWT requires hand-rolling registration, password hashing, session persistence, token refresh. Better Auth handles all of this out of the box with tested security. |
| Better Auth | Lucia | Lucia is deprecated/archived. Author recommends rolling your own or using Better Auth. |
| Prisma 7 | Prisma 6 | Prisma 6 is maintenance-only. Prisma 7 is the actively developed version. Migration is mandatory for new projects. |
| Prisma 7 | Drizzle | Drizzle has weaker migration tooling. Prisma has better multi-tenant extension patterns and is user-specified in design doc. |
| Next.js 15 | Next.js 16 | 16 is available with Turbopack stable, but user design doc specifies 15. Upgrading to 16 later is straightforward. |
| pnpm 10 | pnpm 9 | pnpm 10 is current. No reason to use 9. |

**Installation (root):**
```bash
# Initialize monorepo
pnpm dlx create-turbo@latest

# Or manual setup
mkdir TechTeam && cd TechTeam
pnpm init
```

**Installation (apps/api):**
```bash
pnpm add fastify @fastify/cors @fastify/cookie better-auth dotenv
pnpm add -D @types/node tsx typescript prisma
```

**Installation (apps/web):**
```bash
pnpm add @tanstack/react-query react-hook-form @hookform/resolvers zod
pnpm add lucide-react clsx tailwind-merge
pnpm add -D tailwindcss @tailwindcss/postcss
```

**Installation (packages/shared or packages/database):**
```bash
pnpm add @prisma/client @prisma/adapter-pg pg zod dotenv
pnpm add -D prisma @types/pg
```

## Architecture Patterns

### Recommended Project Structure

```
TechTeam/
├── apps/
│   ├── web/                      # Next.js 15 (App Router)
│   │   ├── src/
│   │   │   ├── app/              # App Router pages
│   │   │   │   ├── (auth)/       # Auth pages (login, register)
│   │   │   │   │   ├── login/
│   │   │   │   │   └── register/
│   │   │   │   ├── (dashboard)/  # Protected pages
│   │   │   │   │   └── projects/
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── components/       # UI components
│   │   │   │   ├── ui/           # shadcn/ui components
│   │   │   │   ├── auth/         # Auth forms
│   │   │   │   └── projects/     # Project components
│   │   │   └── lib/
│   │   │       ├── auth-client.ts  # Better Auth client
│   │   │       ├── api.ts          # API client (fetch wrapper)
│   │   │       └── utils.ts        # cn() helper, etc.
│   │   ├── package.json
│   │   └── next.config.ts
│   │
│   └── api/                      # Fastify backend
│       ├── src/
│       │   ├── server.ts           # Fastify app setup + plugin registration
│       │   ├── auth.ts             # Better Auth instance configuration
│       │   ├── routes/
│       │   │   ├── auth.ts         # Better Auth catch-all route
│       │   │   └── projects.ts     # Project CRUD routes
│       │   ├── plugins/
│       │   │   ├── auth.ts         # Auth preHandler hook (session validation)
│       │   │   └── tenant.ts       # Tenant-scoped Prisma injection
│       │   └── lib/
│       │       ├── prisma.ts       # Prisma client + tenant extension
│       │       └── config.ts       # Environment config
│       └── package.json
│
├── packages/
│   ├── shared/                   # Shared types, validators, constants
│   │   ├── src/
│   │   │   ├── schemas/          # Zod schemas (project, user, etc.)
│   │   │   ├── types/            # TypeScript types
│   │   │   └── constants/        # Shared constants (stages, roles, etc.)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── database/                 # Prisma schema + client (alternative: keep in shared)
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       ├── prisma.config.ts      # NEW in Prisma 7 -- required
│       ├── src/
│       │   ├── client.ts         # PrismaClient with adapter
│       │   └── tenant.ts         # forTenant() extension
│       ├── generated/            # Prisma 7 generated output
│       │   └── prisma/
│       └── package.json
│
├── docker-compose.yml            # PostgreSQL 16 + Redis 7
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── .env                          # Root env (DATABASE_URL, etc.)
└── .env.example
```

### Pattern 1: Prisma 7 Client with Driver Adapter

**What:** Prisma 7 requires explicit driver adapter instantiation. No more automatic connection management.
**When to use:** Every Prisma Client instantiation.

```typescript
// packages/database/src/client.ts
// Source: https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/postgresql
import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client.js"

const connectionString = process.env.DATABASE_URL!

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

export { prisma, PrismaClient }
export type { PrismaClient as PrismaClientType }
```

```typescript
// packages/database/prisma.config.ts
// Source: https://www.prisma.io/docs/orm/reference/prisma-config-reference
import "dotenv/config"
import { defineConfig, env } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
```

```prisma
// packages/database/prisma/schema.prisma
// Source: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

### Pattern 2: Multi-Tenant Isolation via Prisma Client Extensions (NOT Middleware)

**What:** Automatically inject tenantId into all queries using Client Extensions query component. Replaces the deprecated/removed `$use()` middleware.
**When to use:** Every request handler. Create a tenant-scoped client per request.

```typescript
// packages/database/src/tenant.ts
// Source: https://www.prisma.io/docs/orm/prisma-client/client-extensions/query
import { prisma } from "./client.js"

// Models that require tenant filtering
const TENANT_MODELS = ["Project", "User"] as const

export function forTenant(tenantId: string) {
  return prisma.$extends({
    name: "tenantIsolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Only filter models that have tenantId
          if (!TENANT_MODELS.includes(model as any)) {
            return query(args)
          }

          // Inject tenantId into read operations
          if (
            operation === "findMany" ||
            operation === "findFirst" ||
            operation === "findUnique" ||
            operation === "count" ||
            operation === "aggregate"
          ) {
            args.where = { ...args.where, tenantId }
          }

          // Inject tenantId into create operations
          if (operation === "create") {
            args.data = { ...args.data, tenantId }
          }
          if (operation === "createMany") {
            if (Array.isArray(args.data)) {
              args.data = args.data.map((item: any) => ({
                ...item,
                tenantId,
              }))
            }
          }

          // Inject tenantId into update/delete operations
          if (
            operation === "update" ||
            operation === "updateMany" ||
            operation === "delete" ||
            operation === "deleteMany"
          ) {
            args.where = { ...args.where, tenantId }
          }

          return query(args)
        },
      },
    },
  })
}
```

```typescript
// apps/api/src/plugins/tenant.ts
// Fastify hook to inject tenant-scoped Prisma client
import fp from "fastify-plugin"
import { forTenant } from "@techteam/database"

export default fp(async (fastify) => {
  fastify.decorateRequest("prisma", null)

  fastify.addHook("preHandler", async (request, reply) => {
    // session.activeOrganizationId comes from Better Auth organization plugin
    const tenantId = request.session?.session?.activeOrganizationId
    if (!tenantId) {
      return reply.status(403).send({ error: "No active organization" })
    }
    request.prisma = forTenant(tenantId)
  })
})
```

### Pattern 3: Better Auth with Fastify + Organization Plugin

**What:** Full authentication system with organization-based multi-tenancy.
**When to use:** All auth flows (register, login, logout, session management).

```typescript
// apps/api/src/auth.ts
// Source: https://www.better-auth.com/docs/installation
// Source: https://www.better-auth.com/docs/plugins/organization
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { organization } from "better-auth/plugins"
import { prisma } from "@techteam/database"

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,      // Refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,             // 5-minute cookie cache
    },
  },
  trustedOrigins: [process.env.WEB_URL || "http://localhost:3000"],
  plugins: [
    organization({
      // Organization = Tenant in our model
      // Adds activeOrganizationId to session
    }),
  ],
})
```

```typescript
// apps/api/src/routes/auth.ts
// Source: https://www.better-auth.com/docs/integrations/fastify
import type { FastifyInstance } from "fastify"
import { auth } from "../auth.js"

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.all("/api/auth/*", async (request, reply) => {
    const url = new URL(
      request.url,
      `${request.protocol}://${request.hostname}`
    )
    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.set(key, String(value))
    }

    const req = new Request(url, {
      method: request.method,
      headers,
      body: request.method !== "GET" ? JSON.stringify(request.body) : undefined,
    })

    const response = await auth.handler(req)

    // Forward response headers (cookies, etc.)
    response.headers.forEach((value, key) => {
      reply.header(key, value)
    })

    return reply.status(response.status).send(await response.json())
  })
}
```

```typescript
// apps/web/src/lib/auth-client.ts
// Source: https://www.better-auth.com/docs/installation
import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  plugins: [organizationClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
```

### Pattern 4: Zod Schema Sharing (packages/shared)

**What:** Single source of truth for validation schemas shared between frontend and backend.
**When to use:** All API payloads, form validation.

```typescript
// packages/shared/src/schemas/project.ts
import { z } from "zod"

export const projectCreateSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  repoUrl: z.string().url(),
  repoPath: z.string().min(1),
  techStack: z.string().min(1),
  maxConcurrentDev: z.number().int().min(1).max(3).default(1),
  mergeStrategy: z.enum(["fifo", "priority"]).default("fifo"),
})

export const projectUpdateSchema = projectCreateSchema.partial()

export type ProjectCreate = z.infer<typeof projectCreateSchema>
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>
```

### Pattern 5: Prisma 7 Schema (ESM, New Generator)

**What:** Prisma 7 schema requires new generator config and explicit output path.

```prisma
// packages/database/prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// === AUTH TABLES (managed by Better Auth) ===
// Better Auth creates: user, session, account, verification tables
// Run: npx @better-auth/cli generate
// Then merge with our custom models

// === TENANT / ORGANIZATION ===
// Better Auth organization plugin creates: organization, member, invitation tables

// === CUSTOM MODELS ===
model Project {
  id                String   @id @default(cuid())
  tenantId          String   // Maps to organization.id from Better Auth
  name              String
  description       String?
  repoUrl           String
  repoPath          String
  defaultBranch     String   @default("main")
  techStack         String
  status            ProjectStatus @default(active)
  maxConcurrentDev  Int      @default(1)
  mergeStrategy     MergeStrategy @default(fifo)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([tenantId])
}

enum ProjectStatus {
  active
  archived
}

enum MergeStrategy {
  fifo
  priority
}
```

### Anti-Patterns to Avoid

- **Using Prisma middleware ($use):** REMOVED in Prisma 7. Will not compile. Use Client Extensions query component instead.
- **Creating PrismaClient without driver adapter:** Prisma 7 requires explicit driver adapter. `new PrismaClient()` alone will fail.
- **Using `provider = "prisma-client-js"` in schema:** Prisma 7 requires `provider = "prisma-client"` for the new Rust-free engine.
- **Importing from `@prisma/client`:** Prisma 7 generates to a custom output path. Import from the generated directory.
- **Manual JWT with @fastify/jwt for full auth:** Hand-rolling registration, password hashing, session management, token refresh when Better Auth handles all of it with tested security.
- **Storing tenantId filtering in application code:** Must be at ORM level via Client Extensions. Application-level filtering is fragile and easy to forget.
- **Missing `"type": "module"` in package.json:** Prisma 7 ships as ESM. Without this, imports will fail.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User registration + password hashing | Custom bcrypt/argon2 + email validation | Better Auth `emailAndPassword` | Handles hashing, validation, timing attacks, common security pitfalls |
| Session management + persistence | Manual JWT generation, cookie handling, refresh tokens | Better Auth sessions with cookieCache | Cookie-based sessions with auto-refresh, persistence across browser restarts |
| Tenant/organization management | Custom organization table + member management | Better Auth organization plugin | Includes roles, invitations, active organization switching |
| Multi-tenant data isolation | Manual where clauses in every query | Prisma Client Extensions `forTenant()` | Impossible to forget filtering when it's at ORM level |
| Form validation (frontend) | Custom validation logic | Zod + react-hook-form + @hookform/resolvers | Single schema validates both frontend forms and backend API |
| Component library | Custom buttons, modals, dropdowns | shadcn/ui (Radix primitives + Tailwind) | Accessible, customizable, consistent design |

**Key insight:** Phase 1 is about establishing patterns that every future phase depends on. Better Auth and Prisma Client Extensions provide battle-tested implementations of the two highest-risk areas (auth and tenant isolation). Hand-rolling these introduces bugs that propagate to all 6 phases.

## Common Pitfalls

### Pitfall 1: Prisma 7 Migration Blindspot

**What goes wrong:** Developer follows Prisma 6 tutorials or the old research docs. Code uses `$use()` middleware, imports from `@prisma/client`, uses `prisma-client-js` generator. Nothing works.
**Why it happens:** Prisma 7 was released recently and has fundamental breaking changes. Old tutorials and AI-generated code still reference Prisma 6 patterns.
**How to avoid:** Always reference the Prisma 7 upgrade guide. Use `prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts`, ESM modules, and Client Extensions.
**Warning signs:** Import errors, "Cannot find module @prisma/client", middleware compilation errors.

### Pitfall 2: Better Auth + Prisma 7 Schema Conflicts

**What goes wrong:** Better Auth generates its own schema (user, session, account, verification tables). These conflict with manually defined Prisma models.
**Why it happens:** Better Auth CLI (`npx @better-auth/cli generate`) creates Prisma schema additions that must be merged with the application schema.
**How to avoid:** Run Better Auth CLI first to generate its schema requirements, then add custom models (Project, etc.) to the same schema file. Never manually define user/session tables.
**Warning signs:** Migration conflicts, duplicate model errors, missing columns in auth tables.

### Pitfall 3: Tenant Data Leakage

**What goes wrong:** A query skips tenant filtering, exposing Tenant A's data to Tenant B.
**Why it happens:** Developer creates a raw query, uses base PrismaClient instead of `forTenant()`, or adds a new model without including it in TENANT_MODELS array.
**How to avoid:** (1) Never use base PrismaClient in route handlers -- always use `request.prisma` (tenant-scoped). (2) Add integration tests that verify cross-tenant isolation. (3) Code review checklist includes "Does this query use tenant-scoped client?"
**Warning signs:** A user can see projects from another organization.

### Pitfall 4: Cookie/CORS Misconfiguration (Auth Fails Silently)

**What goes wrong:** Login succeeds on backend but session cookie is not set in browser. User appears logged in, then loses session on page refresh.
**Why it happens:** CORS not configured with `credentials: true`, or origin mismatch between Next.js dev server (localhost:3000) and Fastify (localhost:3001). SameSite cookie settings block cross-origin cookies.
**How to avoid:** (1) Configure `@fastify/cors` with `credentials: true` and explicit origin matching the frontend URL. (2) Set Better Auth `trustedOrigins` to include the frontend URL. (3) Test session persistence explicitly in development.
**Warning signs:** 401 errors after page refresh, cookies not appearing in browser DevTools, CORS errors in console.

### Pitfall 5: ESM Module Resolution Issues

**What goes wrong:** Imports between packages fail with "ERR_MODULE_NOT_FOUND" or "Cannot use import statement outside a module".
**Why it happens:** Prisma 7 requires ESM. If some packages use CJS and others use ESM, interoperability breaks. Missing `.js` extensions in imports, wrong tsconfig settings.
**How to avoid:** (1) Set `"type": "module"` in all package.json files. (2) Use `"module": "ESNext"` and `"moduleResolution": "bundler"` in tsconfig. (3) Include `.js` extensions in relative imports for pure Node.js packages. (4) Use tsx for development (handles ESM natively).
**Warning signs:** Module resolution errors at runtime, TypeScript compiles but Node.js fails to load.

### Pitfall 6: Turborepo Task Dependencies Misconfigured

**What goes wrong:** Build runs but packages/database hasn't generated Prisma client before apps/api tries to import it.
**Why it happens:** turbo.json task pipeline doesn't specify that `build` in apps/api depends on `generate` in packages/database.
**How to avoid:** Configure turbo.json with proper `dependsOn` relationships: `"build": { "dependsOn": ["^build"] }` and add a `generate` task for Prisma.
**Warning signs:** Intermittent build failures, "module not found" errors that work on second build.

### Pitfall 7: Docker Compose Port/Data Conflicts

**What goes wrong:** PostgreSQL or Redis fails to start because ports 5432/6379 are already in use, or data volumes contain stale data from different schema.
**Why it happens:** Other projects or system services using same ports. Old volumes with incompatible schema.
**How to avoid:** (1) Use non-default ports in Docker Compose (e.g., 5433:5432). (2) Name volumes with project prefix. (3) Document `docker compose down -v` for clean restart.
**Warning signs:** Connection refused errors, migration failures on existing data.

## Code Examples

Verified patterns from official sources:

### Docker Compose Setup

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_DB: techteam
      POSTGRES_USER: techteam
      POSTGRES_PASSWORD: techteam_dev
    volumes:
      - techteam_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U techteam"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    command: redis-server --appendonly yes
    volumes:
      - techteam_redisdata:/data

volumes:
  techteam_pgdata:
  techteam_redisdata:
```

### pnpm-workspace.yaml

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

### turbo.json

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "generated/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "db:seed": {
      "cache": false
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

### Root package.json Scripts

```json
{
  "name": "techteam",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "db:generate": "turbo db:generate",
    "db:migrate": "turbo db:migrate",
    "db:seed": "turbo db:seed",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down",
    "docker:reset": "docker compose down -v && docker compose up -d"
  },
  "packageManager": "pnpm@10.29.2",
  "engines": {
    "node": ">=22.0.0"
  }
}
```

### Environment Variables

```bash
# .env.example
DATABASE_URL="postgresql://techteam:techteam_dev@localhost:5433/techteam"
REDIS_URL="redis://localhost:6380"
BETTER_AUTH_SECRET="your-secret-key-minimum-32-characters"
BETTER_AUTH_URL="http://localhost:3001"
WEB_URL="http://localhost:3000"
API_PORT=3001
```

### Fastify Server Setup

```typescript
// apps/api/src/server.ts
import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import authRoutes from "./routes/auth.js"
import projectRoutes from "./routes/projects.js"
import tenantPlugin from "./plugins/tenant.js"

const app = Fastify({ logger: true })

// Register plugins
await app.register(cors, {
  origin: process.env.WEB_URL || "http://localhost:3000",
  credentials: true,
})

await app.register(cookie)

// Auth routes (public -- Better Auth handles internally)
await app.register(authRoutes)

// Protected routes (require auth + tenant context)
await app.register(async (protectedApp) => {
  // Auth + tenant middleware for all routes in this scope
  await protectedApp.register(tenantPlugin)
  await protectedApp.register(projectRoutes, { prefix: "/api/projects" })
})

// Start
const port = Number(process.env.API_PORT) || 3001
await app.listen({ port, host: "0.0.0.0" })
console.log(`API running on http://localhost:${port}`)
```

### Database Seed (TENANT-04)

```typescript
// packages/database/prisma/seed.ts
import { prisma } from "../src/client.js"
import { auth } from "../../apps/api/src/auth.js"

async function seed() {
  console.log("Seeding database...")

  // Create default tenant: Bee The Tech
  // Using Better Auth organization API or direct Prisma
  // The exact approach depends on whether Better Auth exposes
  // a server-side API for creating organizations programmatically

  // Option A: Direct database insert for seed
  // (organization table is managed by Better Auth plugin)
  await prisma.organization.upsert({
    where: { slug: "bee-the-tech" },
    update: {},
    create: {
      name: "Bee The Tech",
      slug: "bee-the-tech",
    },
  })

  console.log("Seed complete: Bee The Tech tenant created")
}

seed()
  .catch(console.error)
  .finally(() => process.exit())
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prisma middleware (`$use()`) | Prisma Client Extensions query component | Deprecated v4.16, removed v6.14 | All old multi-tenant middleware code must be rewritten |
| `prisma-client-js` generator | `prisma-client` generator | Prisma 7 (Jan 2026) | Schema files must be updated |
| Automatic DB connection in Prisma | Explicit driver adapter (e.g., `@prisma/adapter-pg`) | Prisma 7 (Jan 2026) | Must install and configure driver adapter |
| CJS Prisma client | ESM-only Prisma client | Prisma 7 (Jan 2026) | All consuming packages must be ESM |
| Connection URL in schema.prisma | Connection URL in prisma.config.ts | Prisma 7 (Jan 2026) | New config file required |
| Lucia for auth | Better Auth | Lucia deprecated 2024 | Lucia author recommends alternatives |
| pnpm 9 | pnpm 10 | 2025 | Minor changes, workspace protocol unchanged |
| Turborepo 2.0 | Turborepo 2.8 | Ongoing | Incremental improvements, same config format |
| Tailwind CSS 3 | Tailwind CSS 4 | Jan 2025 | Complete rewrite, new config format, OKLCH colors |
| Next.js caching by default | Opt-in caching (Next.js 15+) | Oct 2024 | fetch, GET Route Handlers no longer cached by default |

**Deprecated/outdated:**
- **Lucia auth:** Archived by author. Do not use for new projects.
- **Prisma `$use()` middleware:** Removed. Will cause compile errors in Prisma 7.
- **`@prisma/client` direct import:** In Prisma 7, import from generated output path.
- **Bull (job queue):** Deprecated, replaced by BullMQ. (Relevant for future phases.)

## Open Questions

1. **Better Auth organization plugin as Tenant model**
   - What we know: Better Auth's organization plugin creates organization, member, invitation tables. The activeOrganizationId in sessions maps naturally to tenantId.
   - What's unclear: Whether the organization table can have custom additional fields (like `plan`, `slug`) needed for the Tenant model in the design doc, or if we need a separate Tenant model linked to organization.
   - Recommendation: Use Better Auth's `schema.organization.additionalFields` to add `plan` and any other custom fields. This avoids a separate Tenant table and keeps the model clean. Verify during implementation.

2. **Prisma Client Extensions performance at scale**
   - What we know: Extensions run per-query and add minimal overhead for simple where clause injection.
   - What's unclear: Performance impact with complex queries, joins, nested writes.
   - Recommendation: Acceptable for Phase 1 scale. Profile if performance issues arise in later phases. Alternative is PostgreSQL Row Level Security (RLS) at database level.

3. **Better Auth schema generation + custom Prisma models**
   - What we know: Better Auth CLI generates Prisma schema additions. Custom models must coexist.
   - What's unclear: Exact merge workflow when Better Auth CLI generates schema changes alongside our custom models.
   - Recommendation: Run `npx @better-auth/cli generate` once to get the initial schema, then manage the combined schema manually. Re-run CLI only when upgrading Better Auth.

4. **Next.js 15 + Tailwind v4 + shadcn/ui compatibility**
   - What we know: shadcn/ui supports both Tailwind v3 and v4. The CLI can initialize with Tailwind v4.
   - What's unclear: Whether all shadcn/ui components work perfectly with Tailwind v4 in Next.js 15 (not 16).
   - Recommendation: Use `npx shadcn@latest init` which handles Tailwind v4 setup automatically. Test a few components early.

## Sources

### Primary (HIGH confidence)
- Prisma 7 upgrade guide: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
- Prisma 7 quickstart with PostgreSQL: https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/postgresql
- Prisma Client Extensions query component: https://www.prisma.io/docs/orm/prisma-client/client-extensions/query
- Prisma config reference: https://www.prisma.io/docs/orm/reference/prisma-config-reference
- Better Auth installation: https://www.better-auth.com/docs/installation
- Better Auth Fastify integration: https://www.better-auth.com/docs/integrations/fastify
- Better Auth organization plugin: https://www.better-auth.com/docs/plugins/organization
- Better Auth session management: https://www.better-auth.com/docs/concepts/session-management
- Better Auth Prisma adapter: https://www.better-auth.com/docs/adapters/prisma
- Fastify releases (v5.7.4): https://github.com/fastify/fastify/releases
- Turborepo configuration: https://turborepo.dev/docs/reference/configuration
- shadcn/ui Tailwind v4: https://ui.shadcn.com/docs/tailwind-v4
- shadcn/ui Next.js: https://ui.shadcn.com/docs/installation/next

### Secondary (MEDIUM confidence)
- Better Auth + Prisma 7 peer dependency fix: https://github.com/better-auth/better-auth/issues/6746 (resolved Dec 2025)
- Prisma middleware removal: https://github.com/prisma/prisma/discussions/20234
- Prisma multi-tenant extensions discussion: https://github.com/prisma/prisma/discussions/19917
- Prisma RLS extension example: https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security
- Next.js 15 vs 16 comparison: https://www.descope.com/blog/post/nextjs15-vs-nextjs16
- Node.js release schedule: https://endoflife.date/nodejs
- pnpm releases: https://github.com/pnpm/pnpm/releases
- TanStack Query npm: https://www.npmjs.com/package/@tanstack/react-query

### Tertiary (LOW confidence)
- Better Auth multi-tenant SaaS with Fastify article: https://peerlist.io/shrey_/articles/building-better-auth-in-fastify-multitenant-saas-and-secure-api-authentication (community article, not official)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified via official npm/GitHub releases as of Feb 2026. Prisma 7 breaking changes confirmed via official upgrade guide.
- Architecture: HIGH - Patterns derived from official documentation (Prisma extensions, Better Auth plugins, Fastify hooks). Prisma 7 + Better Auth compatibility issue confirmed resolved.
- Pitfalls: HIGH - Prisma 7 migration pitfalls confirmed from official docs and community issues. CORS/cookie pitfalls well-documented in Better Auth and Fastify docs.
- Auth approach: HIGH - Better Auth chosen over deprecated Lucia. Organization plugin maps naturally to multi-tenant design. Prisma 7 compatibility verified.

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (30 days -- stable technologies, low churn expected)
