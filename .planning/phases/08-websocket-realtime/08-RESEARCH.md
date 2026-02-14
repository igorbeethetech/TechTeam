# Phase 8: WebSocket Real-Time - Research

**Researched:** 2026-02-14
**Domain:** WebSocket real-time event propagation (Fastify server, Redis PubSub, TanStack Query client)
**Confidence:** HIGH

## Summary

Phase 8 replaces the platform's current polling-based updates with WebSocket-driven event invalidation. The architecture has three layers: (1) workers publish domain events to Redis PubSub after mutating state, (2) the API server subscribes to Redis PubSub and fans out events to tenant-scoped WebSocket clients, and (3) the frontend receives events and calls `queryClient.invalidateQueries()` on matching query keys -- never receiving full data payloads over WebSocket.

The codebase is well-positioned for this change. The API server (Fastify 5.7+) needs `@fastify/websocket` 11.x registered on a dedicated route. Workers already have `tenantId` in every job, so adding a Redis `PUBLISH` call after each state mutation is mechanical. The frontend already uses TanStack Query with `refetchInterval` for all live data, so replacing polling with WebSocket invalidation requires swapping `refetchInterval` for a WebSocket event listener that calls `invalidateQueries`. The auth plugin's `auth.api.getSession({ headers })` pattern works directly in the WebSocket upgrade `preValidation` hook since `@fastify/websocket` routes respect Fastify hooks.

Key risks are: (1) Redis PubSub requires a dedicated subscriber connection (cannot reuse BullMQ connections), (2) Better Auth's `getSession` during WebSocket upgrade needs testing since it receives an HTTP upgrade request, not a standard request, and (3) the reconnection/fallback logic on the frontend needs clean state management to avoid duplicate polling+WS.

**Primary recommendation:** Use `@fastify/websocket` 11.x with tenant-scoped Redis PubSub channels (`ws:tenant:{tenantId}`), event-based `invalidateQueries` on the frontend, and a custom `useWebSocket` hook that manages connection lifecycle, reconnection with exponential backoff, and polling fallback.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/websocket | ^11.2.0 | WebSocket upgrade handling on Fastify routes | Official Fastify plugin, uses ws@8 under the hood, respects Fastify hooks/encapsulation |
| ioredis | ^5.9.2 (already installed) | Redis PubSub for cross-process event distribution | Already used for BullMQ; PubSub requires separate connection instances |
| @tanstack/react-query | ^5.90.0 (already installed) | Cache invalidation via `invalidateQueries` | Already the data layer; invalidation is the recommended WS integration pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/ws | latest | TypeScript types for ws WebSocket objects | Dev dependency, needed for `socket` parameter typing in WS handlers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom reconnect logic | react-use-websocket | Adds a dependency for something achievable in ~60 lines; custom hook gives more control over polling fallback |
| Redis PubSub | BullMQ events | BullMQ events are worker-scoped, not cross-process; PubSub is the standard for fan-out to multiple API server instances |
| Event invalidation | Full data push via WS | Violates architectural decision; full push bypasses TanStack Query and creates dual data paths |

**Installation:**
```bash
cd apps/api && pnpm add @fastify/websocket && pnpm add -D @types/ws
```

No new frontend packages needed -- the browser's native `WebSocket` API is sufficient.

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
  plugins/
    websocket.ts          # @fastify/websocket plugin registration + WS route
  lib/
    redis.ts              # Add createPubSubConnection() alongside existing functions
    ws-events.ts          # Event type definitions, publishEvent() helper
  routes/
    ws.ts                 # WebSocket route handler with auth + tenant scoping

apps/web/src/
  hooks/
    use-websocket.ts      # Custom hook: connect, reconnect, fallback, invalidation
  components/
    providers.tsx          # Add WebSocketProvider wrapping QueryClientProvider

packages/shared/src/
  types/
    ws-events.ts          # Shared event type definitions (used by both API and web)
```

### Pattern 1: Redis PubSub Event Bus (Server-Side)
**What:** Workers publish events to tenant-scoped Redis PubSub channels after state mutations. The API server subscribes to all active tenant channels and forwards events to WebSocket clients.
**When to use:** Every place a worker or API route mutates demand/agent/notification state.
**Example:**
```typescript
// Source: ioredis docs + project codebase pattern
// apps/api/src/lib/ws-events.ts

import IORedis from "ioredis"
import { config } from "./config.js"

// Dedicated publisher connection (NOT the subscriber, NOT the BullMQ connection)
let publisher: IORedis | null = null

function getPublisher(): IORedis {
  if (!publisher) {
    publisher = new IORedis(config.REDIS_URL)
  }
  return publisher
}

export type WsEventType =
  | "demand:updated"
  | "demand:stage-changed"
  | "agent:status-changed"
  | "agent-run:updated"
  | "notification:created"

export interface WsEvent {
  type: WsEventType
  tenantId: string
  payload: {
    demandId?: string
    projectId?: string
    agentRunId?: string
    notificationId?: string
  }
}

export async function publishWsEvent(event: WsEvent): Promise<void> {
  const channel = `ws:tenant:${event.tenantId}`
  await getPublisher().publish(channel, JSON.stringify(event))
}
```

### Pattern 2: WebSocket Route with Auth Hook (Server-Side)
**What:** A single WebSocket endpoint at `/ws` authenticated via the existing auth plugin's `preValidation` hook. After upgrade, the connection is stored in a tenant-scoped map for broadcasting.
**When to use:** Single endpoint for all WebSocket connections.
**Example:**
```typescript
// Source: @fastify/websocket README + project auth plugin pattern
// apps/api/src/routes/ws.ts

import type { FastifyInstance } from "fastify"
import type { WebSocket } from "ws"

// In-memory map: tenantId -> Set<WebSocket>
const tenantConnections = new Map<string, Set<WebSocket>>()

export default async function wsRoutes(fastify: FastifyInstance) {
  fastify.get("/ws", { websocket: true }, (socket, request) => {
    // Auth hook already validated session before we get here
    const tenantId = request.session?.session?.activeOrganizationId
    if (!tenantId) {
      socket.close(4001, "No tenant context")
      return
    }

    // Register connection
    if (!tenantConnections.has(tenantId)) {
      tenantConnections.set(tenantId, new Set())
    }
    tenantConnections.get(tenantId)!.add(socket)

    // Handle disconnect
    socket.on("close", () => {
      tenantConnections.get(tenantId)?.delete(socket)
      if (tenantConnections.get(tenantId)?.size === 0) {
        tenantConnections.delete(tenantId)
      }
    })

    // Optional: handle ping/pong for keep-alive
    socket.on("pong", () => {
      // Connection is alive
    })
  })
}

// Called from Redis PubSub subscriber to broadcast to tenant clients
export function broadcastToTenant(tenantId: string, message: string): void {
  const connections = tenantConnections.get(tenantId)
  if (!connections) return
  for (const ws of connections) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message)
    }
  }
}
```

### Pattern 3: Event-Based Cache Invalidation (Client-Side)
**What:** A custom React hook connects to the WebSocket server, parses incoming events, and maps them to TanStack Query key invalidations. Falls back to polling when disconnected.
**When to use:** Wrap at provider level, consumed by all pages that need real-time updates.
**Example:**
```typescript
// Source: TkDodo's blog on WS + React Query + project patterns
// apps/web/src/hooks/use-websocket.ts

import { useEffect, useRef, useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

type ConnectionStatus = "connecting" | "connected" | "disconnected"

const EVENT_TO_QUERY_KEYS: Record<string, (payload: any) => string[][]> = {
  "demand:updated": (p) => [["demand", p.demandId], ["demands", p.projectId]],
  "demand:stage-changed": (p) => [["demands", p.projectId]],
  "agent:status-changed": (p) => [["demand", p.demandId], ["demands", p.projectId]],
  "agent-run:updated": (p) => [["agent-runs", p.demandId]],
  "notification:created": (_p) => [["notifications", "unread-count"], ["notifications"]],
}

export function useWebSocket() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const reconnectDelay = useRef(1000)
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")

  const connect = useCallback(() => {
    const wsUrl = `${process.env.NEXT_PUBLIC_API_URL?.replace("http", "ws")}/ws`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setStatus("connected")
      reconnectDelay.current = 1000 // Reset backoff
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      const keysFn = EVENT_TO_QUERY_KEYS[data.type]
      if (keysFn) {
        for (const queryKey of keysFn(data.payload)) {
          queryClient.invalidateQueries({ queryKey })
        }
      }
    }

    ws.onclose = () => {
      setStatus("disconnected")
      // Exponential backoff with jitter
      const jitter = Math.random() * 1000
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000)
        connect()
      }, reconnectDelay.current + jitter)
    }

    wsRef.current = ws
    setStatus("connecting")
  }, [queryClient])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { status }
}
```

### Pattern 4: Polling Fallback When Disconnected
**What:** Components conditionally enable `refetchInterval` only when the WebSocket is disconnected, eliminating double-fetching when connected.
**When to use:** Every component currently using `refetchInterval`.
**Example:**
```typescript
// apps/web/src/components/board/kanban-board.tsx (modified)

const { status: wsStatus } = useWebSocket()

const { data } = useQuery({
  queryKey: ["demands", projectId],
  queryFn: () => api.get<DemandsResponse>(`/api/demands?projectId=${projectId}`),
  // Only poll when WS is disconnected
  refetchInterval: wsStatus === "connected" ? false : 5000,
})
```

### Anti-Patterns to Avoid
- **Full data push over WebSocket:** Sending entire demand objects over WS bypasses TanStack Query's caching, creates two data paths, and wastes bandwidth. Send event type + entity IDs only.
- **Reusing Redis subscriber connection for commands:** A Redis connection in subscriber mode cannot execute normal commands. Always use a dedicated connection for PubSub subscriptions.
- **Polling AND WebSocket simultaneously:** When the WebSocket is connected, disable all `refetchInterval` timers. Layering both wastes server resources and can cause UI flicker.
- **Global catch-all Redis subscription:** Don't subscribe to `*` pattern. Subscribe to specific tenant channels (`ws:tenant:{tenantId}`) as clients connect. Unsubscribe when the last client for a tenant disconnects.
- **Blocking on Redis publish in workers:** `publishWsEvent` should be fire-and-forget (catch errors, log, don't throw). A failed event publish must never block agent execution.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket upgrade handling | Manual HTTP upgrade parser | @fastify/websocket | Handles upgrade negotiation, integrates with Fastify hooks, proper error handling |
| Cross-process event bus | Custom TCP/IPC messaging | Redis PubSub via ioredis | Already deployed, battle-tested, handles multiple API server instances |
| WebSocket heartbeat | Custom ping implementation | ws library's built-in ping/pong | The ws library (used by @fastify/websocket) supports native WebSocket ping/pong frames |
| Connection authentication | Manual cookie parsing + session lookup | Fastify preValidation hook + Better Auth getSession | Reuses existing auth infrastructure; cookies are sent on upgrade request automatically |

**Key insight:** The entire backend event pipeline (Redis PubSub publish in worker -> Redis subscribe in API -> WS broadcast to client) is infrastructure wiring, not application logic. Don't over-engineer it -- a ~200-line module covers the server side.

## Common Pitfalls

### Pitfall 1: Redis PubSub Connection Lifecycle
**What goes wrong:** Using the same ioredis instance for PubSub subscriptions and regular commands. Once `subscribe()` is called, the connection enters subscriber mode and rejects all non-subscriber commands.
**Why it happens:** The existing codebase has `createQueueConnection()` and `createWorkerConnection()` -- developers may try to reuse those.
**How to avoid:** Create a dedicated `createSubscriberConnection()` function in `redis.ts` and document that it is ONLY for PubSub. Create a separate `createPublisherConnection()` for the publish side.
**Warning signs:** Error message "Connection in subscriber mode, only subscriber commands may be used."

### Pitfall 2: WebSocket Auth During HTTP Upgrade
**What goes wrong:** The `preValidation` or `preHandler` hook might not fire, or `request.session` might not be populated because the HTTP upgrade request is not a standard Fastify request.
**Why it happens:** @fastify/websocket routes DO respect Fastify hooks according to official docs, but Better Auth's `getSession` constructs headers from the raw request. The upgrade request includes cookies (browsers send cookies on WebSocket upgrade), so `auth.api.getSession({ headers })` should work -- but this needs validation.
**How to avoid:** Register the WebSocket route inside the existing protected scope (same scope as other routes that use `authPlugin` and `tenantPlugin`). Test the upgrade flow manually with a real browser session cookie. If Better Auth fails on upgrade, fall back to extracting the session token from the cookie header manually and calling `auth.api.getSession` with it.
**Warning signs:** 401 errors on WebSocket connection attempts despite valid browser session.

### Pitfall 3: Connection Map Memory Leak
**What goes wrong:** WebSocket connections accumulate in the `tenantConnections` map without cleanup, especially for crashed/zombie connections that never fire `close` events.
**How to avoid:** Implement a periodic heartbeat (ping every 30 seconds). If no pong received within 10 seconds, terminate the connection. Also clean up on `error` events, not just `close`.
**Warning signs:** Server memory growing steadily over time; stale connections in the map.

### Pitfall 4: Race Condition Between Event and Data Availability
**What goes wrong:** Worker publishes a Redis event, frontend receives WS message and invalidates query, but the database hasn't committed the transaction yet. The refetch returns stale data.
**Why it happens:** Redis PubSub is faster than database commits, especially under load.
**How to avoid:** Publish the Redis event AFTER the Prisma `update`/`create` call resolves (not in a `.then()` chain or before `await`). Since Prisma awaits commit by default, the data will be available when the frontend refetches.
**Warning signs:** Intermittent stale data on the first refetch after a WS event.

### Pitfall 5: Thundering Herd on Server Restart
**What goes wrong:** All connected clients reconnect simultaneously after a server restart, causing a spike of WebSocket upgrades and immediate `invalidateQueries` calls.
**How to avoid:** Add jitter to the client-side reconnection delay (already in the pattern above). The exponential backoff starts at 1s and caps at 30s. Consider adding a small random delay (0-2s) before the initial connection too if needed.
**Warning signs:** CPU/memory spike on the API server immediately after a restart.

### Pitfall 6: Double Polling + WebSocket
**What goes wrong:** Developer adds WebSocket invalidation but forgets to disable `refetchInterval`, resulting in both polling AND event-driven updates running simultaneously.
**Why it happens:** Multiple components independently set `refetchInterval`. It's easy to miss one.
**How to avoid:** The `useWebSocket` hook exposes a `status` that components check. Create a `useRealtimeQuery` wrapper hook that conditionally sets `refetchInterval` based on WS status. Audit ALL current `refetchInterval` usages (there are 4: kanban-board 5s, demand-detail 5s, agent-run-list 5s, notification-bell 10s).
**Warning signs:** Network tab shows periodic fetches even when WS is connected.

## Code Examples

Verified patterns from official sources:

### Registering @fastify/websocket with Fastify 5
```typescript
// Source: @fastify/websocket README, verified compatible with Fastify ^5.0.0
import Fastify from "fastify"
import websocket from "@fastify/websocket"

const app = Fastify({ logger: true })
await app.register(websocket)

// WebSocket route inside a protected scope
await app.register(async (protectedApp) => {
  // Auth hooks apply to WS routes too
  protectedApp.addHook("preValidation", async (request, reply) => {
    // Validate session
  })

  protectedApp.get("/ws", { websocket: true }, (socket, request) => {
    // socket is a ws.WebSocket instance
    // request is a FastifyRequest (with session attached by hooks)
    socket.on("message", (data) => { /* ... */ })
  })
})
```

### Redis PubSub with Dedicated Connections
```typescript
// Source: ioredis docs + Redis PubSub specification
import IORedis from "ioredis"

// Subscriber (enters subscriber mode -- cannot run other commands)
const subscriber = new IORedis(redisUrl)
subscriber.subscribe("ws:tenant:abc123")
subscriber.on("message", (channel, message) => {
  const event = JSON.parse(message)
  broadcastToTenant(event.tenantId, message)
})

// Publisher (separate connection, stays in normal mode)
const publisher = new IORedis(redisUrl)
await publisher.publish("ws:tenant:abc123", JSON.stringify(event))
```

### TanStack Query Invalidation on WebSocket Event
```typescript
// Source: TkDodo's blog "Using WebSockets with React Query" + TanStack Query v5 docs
import { useQueryClient } from "@tanstack/react-query"

const queryClient = useQueryClient()

// When WS event arrives:
// { type: "demand:updated", payload: { demandId: "xyz", projectId: "abc" } }
queryClient.invalidateQueries({ queryKey: ["demand", "xyz"] })
queryClient.invalidateQueries({ queryKey: ["demands", "abc"] })
// This marks queries as stale and triggers refetch if they are currently rendered
```

### Browser WebSocket with Cookie Auth
```typescript
// Source: MDN WebSocket API + browser behavior
// Browsers automatically send cookies on WebSocket upgrade requests
// when connecting to the same origin or a CORS-allowed origin

const ws = new WebSocket("ws://localhost:3010/ws")
// The browser sends the session cookie in the upgrade request headers
// No manual cookie attachment needed
```

### Dynamic Redis Channel Subscription
```typescript
// Source: ioredis docs + Redis SUBSCRIBE/UNSUBSCRIBE semantics
// Subscribe to tenant channel when first client connects
function onClientConnect(tenantId: string) {
  if (!tenantConnections.has(tenantId)) {
    subscriber.subscribe(`ws:tenant:${tenantId}`)
  }
}

// Unsubscribe when last client disconnects
function onClientDisconnect(tenantId: string) {
  if (!tenantConnections.has(tenantId) || tenantConnections.get(tenantId)!.size === 0) {
    subscriber.unsubscribe(`ws:tenant:${tenantId}`)
    tenantConnections.delete(tenantId)
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `refetchInterval` polling every 5s | WebSocket event-based invalidation | This phase | Eliminates polling overhead, sub-second UI updates |
| Full data push over WS | Event-type + entity-ID invalidation | TkDodo's blog (2022), widely adopted by 2024 | TanStack Query handles data fetching; WS only signals "something changed" |
| Socket.IO | Native WebSocket via @fastify/websocket (ws) | Fastify ecosystem convention | Socket.IO adds unnecessary abstraction; ws is lighter, standard-compliant |
| Custom WS server on separate port | @fastify/websocket on same Fastify server | @fastify/websocket v5+ | Single server, hooks work, no CORS issues |

**Deprecated/outdated:**
- `fastify-websocket` (old package name): Use `@fastify/websocket` instead (migrated to @fastify org scope)
- Socket.IO for simple event fan-out: Overkill for this use case; adds rooms/namespaces/auto-reconnect that conflict with our custom tenant isolation

## Inventory of Polling Usages to Replace

These are ALL current `refetchInterval` usages in the frontend. Each must be updated to conditionally poll only when WebSocket is disconnected:

| Component | File | Current Polling | Query Key | WS Event |
|-----------|------|----------------|-----------|----------|
| KanbanBoardView | `components/board/kanban-board.tsx` | `refetchInterval: 5000` always | `["demands", projectId]` | `demand:stage-changed`, `demand:updated`, `agent:status-changed` |
| DemandDetailPage | `app/(dashboard)/demands/[demandId]/page.tsx` | `refetchInterval: 5000` when agent active | `["demand", demandId]` | `demand:updated`, `agent:status-changed` |
| AgentRunList | `components/demands/agent-run-list.tsx` | `refetchInterval: 5000` when agent active | `["agent-runs", demandId]` | `agent-run:updated` |
| NotificationBell | `components/notifications/notification-bell.tsx` | `refetchInterval: 10000` always | `["notifications", "unread-count"]` | `notification:created` |

## Worker Event Emission Points

These are ALL places in the worker codebase where state mutations happen that should trigger WebSocket events:

| Worker | Mutation | Event Type | Key Fields |
|--------|----------|------------|------------|
| agent.worker.ts | AgentRun created (running) | `agent-run:updated` | demandId |
| agent.worker.ts | AgentRun updated (completed/failed/timeout) | `agent-run:updated` | demandId |
| agent.worker.ts | Demand agentStatus updated | `agent:status-changed` | demandId, projectId |
| agent.worker.ts | Demand stage advanced | `demand:stage-changed` | demandId, projectId |
| agent.worker.ts | Demand requirements/plan stored | `demand:updated` | demandId, projectId |
| agent.worker.ts | Notification created (agent failure) | `notification:created` | - |
| merge.worker.ts | Demand mergeStatus updated | `demand:updated` | demandId, projectId |
| merge.worker.ts | Demand stage -> done | `demand:stage-changed` | demandId, projectId |
| merge.worker.ts | Notification created (merge/done) | `notification:created` | - |

## Open Questions

1. **Better Auth getSession on WebSocket upgrade request**
   - What we know: @fastify/websocket routes respect Fastify hooks. The existing auth plugin builds a `Headers` object from `request.headers` and calls `auth.api.getSession({ headers })`. Browsers send cookies on the WebSocket upgrade request.
   - What's unclear: Whether Better Auth's `getSession` correctly handles the HTTP upgrade request, since it's technically not a standard GET response flow (no reply body). The `reply.code(401).send()` in the hook may behave differently during upgrade.
   - Recommendation: Test this in the first task. If `preValidation` hook works, great. If not, use the alternative: extract the session token from the `cookie` header manually and call `getSession` inside the WebSocket handler before registering the connection. A third fallback is the `verifyClient` option on @fastify/websocket registration.

2. **Cross-origin WebSocket cookies**
   - What we know: The API runs on port 3010 and the web app on port 3009. These are different origins. The existing `@fastify/cors` config allows the web origin with `credentials: true`.
   - What's unclear: Whether the browser sends cookies on cross-origin WebSocket upgrade requests. CORS does not apply to WebSocket (no preflight), but browsers may still enforce same-origin cookie policies.
   - Recommendation: During development both apps run on localhost (same host, different ports), so cookies should be sent. If not, consider using a query parameter token as a fallback: `ws://localhost:3010/ws?token=SESSION_TOKEN`. In production behind a reverse proxy, both will be on the same origin.

3. **Scaling to multiple API server instances**
   - What we know: Redis PubSub naturally supports multiple subscribers. Each API server instance subscribes to tenant channels and broadcasts to its own connected clients.
   - What's unclear: Whether the current deployment uses a single API server instance or multiple.
   - Recommendation: The architecture already supports horizontal scaling via Redis PubSub. No additional work needed now, but document this as a benefit.

## Sources

### Primary (HIGH confidence)
- [@fastify/websocket npm](https://www.npmjs.com/package/@fastify/websocket) - Version 11.2.0, uses ws@^8.16.0, devDependency on Fastify ^5.0.0
- [@fastify/websocket GitHub README](https://github.com/fastify/fastify-websocket) - Hook behavior, authentication pattern, TypeScript usage, testing with injectWS
- [ioredis GitHub](https://github.com/redis/ioredis) - PubSub requires dedicated connections, subscribe/publish API
- [TanStack Query v5 docs - Query Invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation) - invalidateQueries API, stale marking behavior
- Project codebase analysis (auth.ts, plugins/auth.ts, agent.worker.ts, merge.worker.ts, kanban-board.tsx, demand detail page, notification-bell.tsx) - Current polling patterns, auth flow, worker mutation points

### Secondary (MEDIUM confidence)
- [TkDodo's blog - Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query) - Event-based invalidation as recommended pattern, useEffect-based WS setup
- [Better Auth with websockets discussion](https://www.answeroverflow.com/m/1404759098020593755) - Session handling during WS upgrade
- [LogRocket - TanStack Query and WebSockets](https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/) - Integration patterns
- [Better Stack - Fastify WebSockets guide](https://betterstack.com/community/guides/scaling-nodejs/fastify-websockets/) - Full setup walkthrough

### Tertiary (LOW confidence)
- [Better Auth issue #1001](https://github.com/better-auth/better-auth/issues/1001) - Headers handling with Fastify (needs validation in context of WS upgrade)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @fastify/websocket 11.x is the official plugin, ioredis PubSub is well-documented, TanStack Query invalidation is the established pattern
- Architecture: HIGH - Redis PubSub -> WS broadcast -> query invalidation is a proven pattern; codebase analysis provides exact mutation points and query keys
- Pitfalls: HIGH - Redis subscriber mode, auth on upgrade, and connection cleanup are well-documented issues with known solutions
- Open questions: MEDIUM - Better Auth on WS upgrade and cross-origin cookies need runtime validation but have reasonable fallback strategies

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable libraries, unlikely to change significantly)
