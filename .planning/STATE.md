# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** Demandas de desenvolvimento fluem automaticamente do input humano ate codigo pronto para merge, com agentes IA executando cada fase e o humano tendo visibilidade total via dashboard Kanban.
**Current focus:** Milestone v1.1 -- Phase 8: WebSocket Real-time

## Current Position

Phase: 8 - WebSocket Real-time
Plan: 2 of 3 complete
Status: Executing phase 08 -- plan 02 delivered
Last activity: 2026-02-14 -- Plan 08-02 completed (worker event emission)

Progress: [########██████████████████████] 64% (7/11 phases complete)

v1.0: [██████████████████████████████] 100% (6/6 phases)
v1.1: [██████░░░░░░░░░░░░░░░░░░░░░░░░] 20% (1/5 phases complete)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 16
- Average duration: 9min
- Total execution time: 2.30 hours

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/3 | 70min | 23min |
| 02-kanban-demands | 2/2 | 15min | 8min |
| 03-agent-pipeline | 3/3 | 17min | 6min |
| 04-dev-testing | 3/3 | 16min | 5min |
| 05-merge-concurrency | 3/3 | 7min | 2min |
| 06-metrics-notifications | 2/2 | 11min | 6min |

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 07-sidebar-navigation | 2/2 | 6min | 3min |
| 08-websocket-realtime | 2/3 | 8min | 4min |
| 09-claude-max | — | — | — |
| 10-docker-deploy | — | — | — |
| 11-pipeline-e2e | — | — | — |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.0]: All 6 phases delivered and UAT tested -- 23/28 tests passed, 3 gaps fixed, 1 skipped
- [v1.0 UAT]: staleTime: 0 fix for demand detail polling -- global staleTime: 30s was suppressing UI updates
- [v1.0 UAT]: Clarification form + POST /api/demands/:id/clarify -- enables human intervention when agent pauses
- [v1.0 UAT]: TenantSettings model + Settings page -- per-tenant GitHub token and Anthropic API key storage
- [v1.0 UAT]: Board button added to ProjectCard -- was missing from projects page
- [v1.1]: User wants Claude MAX as alternative to API key -- requires CLI headless integration
- [v1.1]: User wants Jira-style sidebar navigation -- dedicated Boards page with project selector
- [v1.1]: Telegram notifications deferred to v2 -- WebSocket is the priority for real-time
- [v1.1]: WebSocket uses event-based TanStack Query invalidation, not full data push
- [v1.1]: Sidebar navigation first -- layout restructuring before wiring real-time events
- [v1.1]: Docker deploy after all features -- containerize once code is stable
- [07-01]: AppSidebar calls useSession() internally -- avoids prop drilling, session cached by auth client
- [07-01]: collapsible="icon" mode for sidebar -- tooltip-on-hover, not expand-on-hover
- [07-01]: Shared query key ["projects"] between sidebar and projects page -- auto-invalidation on mutations
- [07-02]: router.push on card div instead of Link wrapper -- avoids nested interactive elements (button inside Link)
- [07-02]: KanbanItemContext for drag handle delegation -- useKanbanItemHandle hook exports activator ref and listeners
- [07-02]: TouchSensor 300ms delay alongside PointerSensor -- mobile long-press drag support
- [08-01]: WeakMap for heartbeat isAlive tracking -- avoids polluting WebSocket instances with custom properties
- [08-01]: Lazy Redis subscriber creation -- only creates connection when first WebSocket client connects
- [08-01]: Dynamic channel subscription per tenant -- subscribes/unsubscribes based on active client count
- [08-01]: WebSocket route inside protected scope -- auth and tenant hooks fire on HTTP upgrade request
- [08-02]: emitEvent double-safety wrapper -- publishWsEvent internal catch + emitEvent outer catch ensures worker never crashes on event publish failure
- [08-02]: Events published AFTER Prisma resolves -- prevents race condition where frontend refetches stale data before DB commit

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Claude CLI subprocess may have ENOENT spawn errors in Docker containers due to PATH inheritance issues -- needs validation during Phase 10
- [Research]: @fastify/websocket auth on upgrade -- exact auth decorator behavior during HTTP upgrade handshake needs testing during Phase 8
- [Research]: Prisma binary targets for Alpine Docker -- may need explicit binaryTargets in schema.prisma for Alpine containers during Phase 10
- [Research]: Next.js standalone + monorepo -- workspace:* resolution in standalone mode needs verification during Phase 10

## Session Continuity

Last session: 2026-02-14
Stopped at: Completed 08-02-PLAN.md (worker event emission)
Resume file: .planning/phases/08-websocket-realtime/08-02-SUMMARY.md
Next action: Execute 08-03-PLAN.md (frontend useWebSocket hook and event-based invalidation)
