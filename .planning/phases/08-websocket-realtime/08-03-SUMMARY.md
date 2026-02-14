---
phase: 08-websocket-realtime
plan: 03
subsystem: web
tags: [websocket, react, tanstack-query, real-time, invalidation, polling-fallback]

# Dependency graph
requires:
  - phase: 08-01
    provides: "WebSocket server infrastructure, /ws endpoint, Redis PubSub, WsEvent types"
  - phase: 08-02
    provides: "Worker event emission via publishWsEvent()"
provides:
  - "WebSocketProvider component wrapping entire app with single WS connection"
  - "useWsStatus() hook exposing connection status to all components"
  - "Event-to-query-key mapping for TanStack Query invalidation"
  - "Conditional polling fallback in all 5 dashboard components"
affects: [09-claude-max, 10-docker-deploy, 11-pipeline-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns: ["WebSocket context provider with useWsStatus hook", "Event-based TanStack Query invalidation via queryClient.invalidateQueries", "Conditional refetchInterval gated by WS connection status", "Exponential backoff reconnection with jitter (1s-30s)"]

key-files:
  created:
    - apps/web/src/hooks/use-websocket.tsx
  modified:
    - apps/web/src/components/providers.tsx
    - apps/web/src/components/board/kanban-board.tsx
    - apps/web/src/app/(dashboard)/projects/[projectId]/board/page.tsx
    - apps/web/src/app/(dashboard)/demands/[demandId]/page.tsx
    - apps/web/src/components/demands/agent-run-list.tsx
    - apps/web/src/components/notifications/notification-bell.tsx

key-decisions:
  - "TSX extension for use-websocket.tsx -- WebSocketProvider returns JSX, requires TSX"
  - "Single app-wide WebSocket connection via React context provider"
  - "EVENT_TO_QUERY_KEYS mapping converts server events to exact query key invalidations"
  - "Conditional polling: wsStatus === connected disables refetchInterval, disconnected restores original intervals"
  - "Reconnection backoff resets to 1s on successful connection"

patterns-established:
  - "useWsStatus() as the universal WS status check in components"
  - "wsStatus === 'connected' ? false : originalInterval pattern for conditional polling"
  - "WebSocketProvider inside QueryClientProvider (needs useQueryClient)"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 8 Plan 03: Frontend WebSocket Client Summary

**useWebSocket hook with event-based TanStack Query invalidation, exponential backoff reconnection, and conditional polling fallback across 5 dashboard components**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T16:21:45Z
- **Completed:** 2026-02-14T16:24:44Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- WebSocketProvider establishes a single app-wide WebSocket connection with automatic reconnection
- EVENT_TO_QUERY_KEYS mapping translates 5 server event types into precise TanStack Query invalidations
- useWsStatus() hook exposes connection status ("connecting" | "connected" | "disconnected") via React context
- All 5 polling components (kanban-board, board page, demand detail, agent-run-list, notification-bell) conditionally disable polling when WS is connected
- Exponential backoff reconnection with jitter (1s base, 30s max, 0-1s random jitter) handles server restarts gracefully
- Zero polling when WebSocket is connected -- all UI updates driven by WS event invalidation
- Polling automatically resumes at original intervals when WS disconnects (graceful degradation)

## Task Commits

Each task was committed atomically:

1. **Task 1: useWebSocket hook with reconnection, invalidation, and WebSocketProvider** - `cf48e29` (feat)
2. **Task 2: Replace polling with conditional refetchInterval in all 5 components** - `2f7b6d7` (feat)

## Files Created/Modified
- `apps/web/src/hooks/use-websocket.tsx` - WebSocketProvider, useWsStatus, EVENT_TO_QUERY_KEYS mapping, reconnection logic
- `apps/web/src/components/providers.tsx` - Added WebSocketProvider wrapping children inside QueryClientProvider
- `apps/web/src/components/board/kanban-board.tsx` - Conditional 5s poll gated by wsStatus
- `apps/web/src/app/(dashboard)/projects/[projectId]/board/page.tsx` - Conditional 5s poll gated by wsStatus
- `apps/web/src/app/(dashboard)/demands/[demandId]/page.tsx` - Conditional smart agent-active poll gated by wsStatus
- `apps/web/src/components/demands/agent-run-list.tsx` - Conditional 5s active-agent poll gated by wsStatus
- `apps/web/src/components/notifications/notification-bell.tsx` - Conditional 10s poll gated by wsStatus

## Decisions Made
- **TSX extension:** use-websocket.tsx uses TSX because WebSocketProvider returns JSX elements. The plan referenced .ts but TSX is required for React components.
- **Single connection model:** One WebSocket connection per app, shared via React context -- avoids multiple connections per component.
- **Event-to-query mapping:** Server events map to exact query keys, ensuring only affected data is refetched (not the entire cache).
- **Conditional polling pattern:** `wsStatus === "connected" ? false : originalInterval` preserves each component's original polling behavior as fallback.
- **Reconnection reset:** Backoff delay resets to 1s on successful connection, ensuring fast reconnection after brief network blips.

## Deviations from Plan

None - plan executed exactly as written (with the pre-noted TSX extension adjustment).

## Issues Encountered

None.

## User Setup Required

None - WebSocket connection is automatic on app load. If API server is not running, reconnection attempts occur silently with backoff.

## Next Phase Readiness
- Phase 08 (WebSocket Real-time) is now fully complete: server infrastructure (01), worker events (02), and frontend client (03)
- All dashboard pages update in real-time via WebSocket when both API and web are running
- Polling serves as automatic fallback when WebSocket is disconnected
- Ready for Phase 09 (Claude MAX integration) and Phase 10 (Docker deployment)

## Self-Check: PASSED

- All 7 key files verified present on disk
- Commit `cf48e29` found (Task 1)
- Commit `2f7b6d7` found (Task 2)
- `pnpm build` passes with zero errors across all packages

---
*Phase: 08-websocket-realtime*
*Completed: 2026-02-14*
