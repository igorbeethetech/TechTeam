---
phase: 09-claude-max
plan: 01
subsystem: agents
tags: [claude-cli, child-process, prisma, agent-routing, subprocess]

# Dependency graph
requires:
  - phase: 03-agent-pipeline
    provides: "base-agent.ts with executeAgent, AgentExecutionParams, AgentExecutionResult"
  - phase: 01-foundation
    provides: "TenantSettings model in Prisma schema"
provides:
  - "AgentExecutionMode enum (sdk | cli) on TenantSettings"
  - "executeAgentCli function for Claude MAX CLI subprocess execution"
  - "executeAgentAuto router dispatching to SDK or CLI based on tenant config"
affects: [09-02-claude-max, 10-docker-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI subprocess execution via node:child_process spawn with stdin piping"
    - "Agent execution routing via tenant config lookup"

key-files:
  created:
    - apps/api/src/agents/base-agent-cli.ts
    - apps/api/src/agents/agent-router.ts
  modified:
    - packages/database/prisma/schema.prisma

key-decisions:
  - "Stdin piping for prompts instead of -p CLI arg to avoid command-line length limits"
  - "Each allowedTools passed as separate arg after --allowedTools flag"
  - "tokensIn/tokensOut set to 0 for CLI mode since CLI does not expose token counts"
  - "Default to sdk mode when no TenantSettings record exists for tenant"

patterns-established:
  - "Agent router pattern: executeAgentAuto(tenantId, params) as single dispatch entry point"
  - "CLI executor mirrors SDK interface: same params in, same result out"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 9 Plan 1: Claude MAX CLI Infrastructure Summary

**AgentExecutionMode enum on TenantSettings with CLI executor spawning `claude` subprocess and tenant-aware routing via executeAgentAuto**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T18:44:26Z
- **Completed:** 2026-02-14T18:47:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added AgentExecutionMode enum (sdk/cli) and field to TenantSettings with default sdk
- Created CLI executor that spawns `claude` with JSON output, stdin piping, timeout, and ENOENT handling
- Created agent router that dispatches to SDK or CLI executor based on tenant's agentExecutionMode setting
- All files compile with zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema migration** - `65a43da` (feat)
2. **Task 2: CLI executor and agent router** - `989c3ee` (feat)

## Files Created/Modified
- `packages/database/prisma/schema.prisma` - Added AgentExecutionMode enum and agentExecutionMode field to TenantSettings
- `apps/api/src/agents/base-agent-cli.ts` - CLI executor that spawns `claude` subprocess with JSON output, stdin piping, structured output, timeout, and error handling
- `apps/api/src/agents/agent-router.ts` - Routing function that checks TenantSettings.agentExecutionMode and dispatches to SDK or CLI executor

## Decisions Made
- **Stdin piping over -p arg:** Prompt is written to child.stdin instead of passed as CLI argument to avoid Windows ~32K and Linux ~2MB command-line length limits, critical for development agent's long prompts
- **Separate args for allowedTools:** Each tool name passed as individual arg after --allowedTools flag, matching Claude CLI documented pattern
- **Zero token counts for CLI mode:** CLI does not expose tokensIn/tokensOut, so both set to 0; costUsd comes from total_cost_usd (0 for MAX users)
- **Default sdk mode:** When no TenantSettings record exists for a tenant, defaults to "sdk" mode to preserve existing behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Claude CLI authentication is only needed when a tenant switches to "cli" mode, which is a runtime configuration step.

## Next Phase Readiness
- Infrastructure ready for Plan 02: agents can switch from `executeAgent` to `executeAgentAuto` with a single import change
- Settings page toggle and API extension needed in Plan 02 for user-facing mode switching
- Docker PATH configuration for Claude CLI needed in Phase 10

## Self-Check: PASSED

- [x] packages/database/prisma/schema.prisma - FOUND
- [x] apps/api/src/agents/base-agent-cli.ts - FOUND
- [x] apps/api/src/agents/agent-router.ts - FOUND
- [x] .planning/phases/09-claude-max/09-01-SUMMARY.md - FOUND
- [x] Commit 65a43da - FOUND
- [x] Commit 989c3ee - FOUND

---
*Phase: 09-claude-max*
*Completed: 2026-02-14*
