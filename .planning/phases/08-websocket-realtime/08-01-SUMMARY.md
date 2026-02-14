---
phase: 08-websocket-realtime
plan: 01
subsystem: api
tags: [websocket, fastify, redis, pubsub, ioredis, real-time]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Fastify server, auth plugin, tenant plugin, Redis connections"
provides:
  - "Shared WsEventType and WsEvent types in @techteam/shared"
  - "Redis PubSub createSubscriberConnection() and createPublisherConnection() factories"
  - "publishWsEvent() fire-and-forget helper for workers/API to emit events"
  - "cleanupPublisher() for graceful shutdown"
  - "@fastify/websocket plugin registered on Fastify"
  - "Authenticated /ws route with tenant-scoped connection map"
  - "Redis PubSub subscriber with dynamic channel subscription per tenant"
  - "broadcastToTenant() function for server-side event fan-out"
  - "30-second heartbeat with ping/pong zombie connection detection"
affects: [08-02, 08-03, 09-claude-max, 10-docker-deploy]

# Tech tracking
tech-stack:
  added: ["@fastify/websocket ^11.2.0", "@types/ws ^8.18.1"]
  patterns: ["Redis PubSub tenant-scoped channels (ws:tenant:{tenantId})", "Lazy singleton Redis connections", "Fire-and-forget event publishing", "WeakMap for per-socket heartbeat tracking"]

key-files:
  created:
    - packages/shared/src/types/ws-events.ts
    - apps/api/src/lib/ws-events.ts
    - apps/api/src/plugins/websocket.ts
    - apps/api/src/routes/ws.ts
  modified:
    - packages/shared/src/index.ts
    - apps/api/src/lib/redis.ts
    - apps/api/src/server.ts
    - apps/api/package.json

key-decisions:
  - "WeakMap for heartbeat isAlive tracking -- avoids polluting WebSocket instances with custom properties"
  - "Lazy Redis subscriber creation -- only creates connection when first WebSocket client connects"
  - "Dynamic channel subscription -- subscribes/unsubscribes per tenant based on active client count"
  - "WebSocket route inside protected scope -- auth and tenant hooks fire on HTTP upgrade request"

patterns-established:
  - "Redis PubSub channel naming: ws:tenant:{tenantId}"
  - "publishWsEvent() as the universal event emission point for workers and API routes"
  - "broadcastToTenant() as the server-side fan-out from Redis to WebSocket clients"
  - "Heartbeat with WeakMap tracking: ping every 30s, terminate if no pong"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 8 Plan 01: WebSocket Server Infrastructure Summary

**@fastify/websocket server with authenticated /ws endpoint, tenant-scoped Redis PubSub subscriber, heartbeat, and shared WsEvent types**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T17:41:53Z
- **Completed:** 2026-02-14T17:45:07Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Shared WsEventType and WsEvent types importable from @techteam/shared across API and web
- Redis PubSub infrastructure with 4 dedicated connection factories (queue, worker, subscriber, publisher)
- Fire-and-forget publishWsEvent() helper that workers will call after state mutations
- Authenticated WebSocket endpoint at /ws inside protected scope with auth + tenant hooks
- Tenant-scoped connection map with dynamic Redis channel subscription/unsubscription
- 30-second heartbeat with ping/pong to detect and terminate zombie connections
- Graceful shutdown cleanup for heartbeat interval, connections, and Redis subscriber

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared WS event types, Redis PubSub connections, and publishWsEvent helper** - `724fc26` (feat)
2. **Task 2: WebSocket plugin, authenticated /ws route with tenant map, heartbeat, and Redis PubSub subscriber** - `25ccb5b` (feat)

## Files Created/Modified
- `packages/shared/src/types/ws-events.ts` - WsEventType union and WsEvent interface shared between API and web
- `packages/shared/src/index.ts` - Re-exports WsEventType and WsEvent types
- `apps/api/src/lib/redis.ts` - Added createSubscriberConnection() and createPublisherConnection() alongside existing queue/worker factories
- `apps/api/src/lib/ws-events.ts` - publishWsEvent() fire-and-forget helper and cleanupPublisher() for graceful shutdown
- `apps/api/src/plugins/websocket.ts` - @fastify/websocket plugin registration via fastify-plugin
- `apps/api/src/routes/ws.ts` - WebSocket route handler with auth, tenant map, heartbeat, Redis PubSub subscriber, broadcastToTenant
- `apps/api/src/server.ts` - Registers websocket plugin and ws route inside protected scope
- `apps/api/package.json` - Added @fastify/websocket and @types/ws dependencies

## Decisions Made
- **WeakMap for heartbeat tracking:** Used WeakMap<WebSocket, boolean> instead of extending WebSocket prototype, keeping socket instances clean and allowing GC when sockets are removed from the map.
- **Lazy Redis subscriber:** The subscriber connection is only created when the first WebSocket client connects, avoiding unnecessary Redis connections when no clients are active.
- **Dynamic channel subscription:** Subscribe to `ws:tenant:{tenantId}` when first client for that tenant connects, unsubscribe when last client disconnects -- avoids subscribing to all tenant channels globally.
- **WebSocket route inside protected scope:** Registered inside the same scope as other protected routes so auth and tenant preHandler hooks fire automatically on the HTTP upgrade request.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. @fastify/websocket is a pure npm dependency with no external service setup.

## Next Phase Readiness
- WebSocket server infrastructure is complete and ready for Plan 02 (frontend useWebSocket hook and event-based cache invalidation)
- Workers can start publishing events via publishWsEvent() -- Plan 03 will wire this into agent and merge workers
- The /ws endpoint needs runtime testing with a real browser session (auth on upgrade is the research open question)

## Self-Check: PASSED

- All 7 key files verified present on disk
- Commit `724fc26` found (Task 1)
- Commit `25ccb5b` found (Task 2)
- `pnpm build` passes with zero errors across all packages

---
*Phase: 08-websocket-realtime*
*Completed: 2026-02-14*
