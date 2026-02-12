# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Demandas de desenvolvimento fluem automaticamente do input humano ate codigo pronto para merge, com agentes IA executando cada fase e o humano tendo visibilidade total via dashboard Kanban.
**Current focus:** Phase 2 - Kanban and Demands

## Current Position

Phase: 2 of 6 (Kanban and Demands)
Plan: 1 of 2 in current phase
Status: In Progress
Last activity: 2026-02-12 -- Completed 02-01-PLAN.md (demand model, API, and Kanban board)

Progress: [█████░░░░░░░░░░░░░░░] 24%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 20min
- Total execution time: 1.33 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/3 | 70min | 23min |
| 02-kanban-demands | 1/2 | 10min | 10min |

**Recent Trend:**
- Last 5 plans: 01-01 (14min), 01-02 (9min), 01-03 (47min), 02-01 (10min)
- Trend: improving

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 6 phases derived from 68 requirements -- Foundation, Kanban/Demands, Agent Pipeline, Dev/Testing, Merge/Concurrency, Metrics/Notifications
- [Roadmap]: Multi-tenant isolation (Prisma Client Extensions, NOT middleware -- removed in Prisma 7) is Phase 1 scope -- security foundation before any agent work
- [Roadmap]: Discovery + Planning agents in Phase 3 (simplest agents first), Dev + Testing in Phase 4 (code generation second)
- [Roadmap]: Merge and concurrency separated from metrics/notifications for cleaner delivery boundaries
- [01-01]: Root .env loaded via explicit path.resolve() from each package -- dotenv/config CWD doesn't work in monorepo subdirectories
- [01-01]: Package exports need "default" condition alongside "import" for tsx CJS resolver compatibility
- [01-01]: @fastify/cookie latest is v11 (not v12) -- research version was incorrect
- [01-01]: Prisma 7 prisma.config.ts requires dotenv loaded before env() call
- [01-02]: Better Auth models added manually -- @better-auth/cli generate hangs without existing auth config
- [01-02]: Root page.tsx removed -- (dashboard) route group owns / path to avoid Next.js route conflict
- [01-02]: Organization created on signup with slug from email prefix -- ensures immediate tenant context
- [01-03]: Prisma Client Extensions typed args require `any` cast for $allModels.$allOperations -- TypeScript limitation with dynamic model operations
- [01-03]: TENANT_MODELS array defines which models get automatic tenantId filtering -- currently only Project, excludes User (Better Auth managed)
- [01-03]: Removed .js extensions from shared package exports -- webpack resolver incompatibility despite ESM imports working in Node/tsx
- [01-03]: Empty PATCH body handling -- removed Content-Type header when body is undefined to avoid 400 errors from Fastify
- [02-01]: Built Kanban UI primitives manually with @dnd-kit/core + @dnd-kit/sortable because Dice UI registry URL was unavailable -- same API pattern maintained
- [02-01]: Demand stage update uses dual callback pattern -- onMove fires PATCH API, handleValueChange manages local cache for optimistic UI
- [02-01]: TENANT_MODELS now includes "Demand" alongside "Project" -- critical for tenant isolation of demand data

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Claude CLI headless mode (`claude -p`) documentation quality is LOW confidence -- validate before Phase 3
- [Research]: BullMQ concurrency grouping (`groupKey`) needs verification before Phase 5
- [Research]: All stack version numbers require 2026 verification before Phase 1 -- PARTIALLY RESOLVED: @fastify/cookie v12 doesn't exist (fixed to v11), other versions verified OK

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 02-01-PLAN.md
Resume file: .planning/phases/02-kanban-and-demands/02-01-SUMMARY.md
