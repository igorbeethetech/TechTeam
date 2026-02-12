# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Demandas de desenvolvimento fluem automaticamente do input humano ate codigo pronto para merge, com agentes IA executando cada fase e o humano tendo visibilidade total via dashboard Kanban.
**Current focus:** Phase 3 In Progress - Agent Pipeline Infrastructure

## Current Position

Phase: 3 of 6 (Agent Pipeline)
Plan: 1 of 3 in current phase (03-01 complete)
Status: In Progress
Last activity: 2026-02-12 -- Completed 03-01-PLAN.md (agent pipeline infrastructure)

Progress: [███████░░░░░░░░░░░░░] 35%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 16min
- Total execution time: 1.55 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/3 | 70min | 23min |
| 02-kanban-demands | 2/2 | 15min | 8min |
| 03-agent-pipeline | 1/3 | 8min | 8min |

**Recent Trend:**
- Last 5 plans: 01-03 (47min), 02-01 (10min), 02-02 (5min), 03-01 (8min)
- Trend: stable

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
- [02-02]: Sheet side panel for demand creation keeps board visible -- better UX than full-page form
- [02-02]: ExternalLink icon in demand card instead of wrapping card in Link -- stopPropagation avoids drag-and-drop click conflicts
- [02-02]: Ternary expressions for unknown-typed fields (requirements, plan) to satisfy ReactNode type constraints
- [02-02]: Progressive disclosure for future-phase fields -- shown only when populated by agents
- [03-01]: ANTHROPIC_API_KEY as optionalEnv -- API server should not crash when key isn't set, only worker needs it at runtime
- [03-01]: Stub agent files for discovery/planning -- allows TypeScript compilation while deferring implementation to Plans 02/03
- [03-01]: Worker concurrency set to 2 -- balances throughput with Claude API rate limits
- [03-01]: Separate Redis connections for Queue (default) and Worker (maxRetriesPerRequest: null) -- BullMQ requirement for blocking commands

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Claude CLI headless mode (`claude -p`) -- RESOLVED: Using @anthropic-ai/claude-agent-sdk TypeScript SDK instead (typed results, structured output, native cost tracking)
- [Research]: BullMQ concurrency grouping (`groupKey`) needs verification before Phase 5
- [Research]: All stack version numbers require 2026 verification before Phase 1 -- PARTIALLY RESOLVED: @fastify/cookie v12 doesn't exist (fixed to v11), other versions verified OK

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 03-01-PLAN.md (agent pipeline infrastructure)
Resume file: .planning/phases/03-agent-pipeline/03-01-SUMMARY.md
