# Architecture Patterns: v1.1 Feature Integration

**Domain:** AI Agent Orchestration Platform -- Subsequent Milestone
**Researched:** 2026-02-13
**Confidence:** MEDIUM-HIGH

> **Scope:** This document covers how five v1.1 features integrate with the existing TechTeam architecture. It does NOT redesign the existing system -- it maps integration points, new components, data flow changes, and build order.

---

## Current Architecture Snapshot

```
                    +-----------------------+
                    |  Next.js 15 Frontend  |
                    |  (dashboard) layout   |
                    |  TanStack Query poll  |
                    +-----------+-----------+
                                |  HTTP/REST (fetch + cookies)
                                v
                    +-----------+-----------+
                    |  Fastify 5 API        |
                    |  Better Auth plugin   |
                    |  Tenant plugin        |
                    |  protectedApp wrapper |
                    +-----------+-----------+
                       |                |
            +----------+    +-----------+-----------+
            |               |  BullMQ Queues        |
            v               |  agent-pipeline       |
     +------+------+        |  merge-queue          |
     | PostgreSQL  |        +-----------+-----------+
     | Prisma 7    |                    |
     | forTenant() |                    v
     +-------------+        +-----------+-----------+
                            |  Worker Process       |
                            |  agent.worker.ts      |
                            |  merge.worker.ts      |
            +-------------+ +-----------+-----------+
            |  Redis 7    |             |
            |  (BullMQ)   |             v
            +-------------+ +-----------+-----------+
                            |  Claude Agent SDK     |
                            |  base-agent.ts        |
                            |  executeAgent()       |
                            +-----------------------+
```

Key existing patterns:
- **Layout:** Top header with nav links (Projects, Metrics, Settings) + NotificationBell. No sidebar.
- **Agent execution:** In-process via `@anthropic-ai/claude-agent-sdk` `query()` function. Not CLI subprocess.
- **Real-time:** TanStack Query `refetchInterval` polling (5s board, 10s notifications).
- **Notifications:** In-app only. Notification model with `type` enum, bell + popover panel.
- **Docker:** Compose for Postgres + Redis only. Apps run natively via `tsx watch`.

---

## Feature 1: Sidebar Navigation

### Integration Points

**Files Modified:**
| File | Change | Impact |
|------|--------|--------|
| `apps/web/src/app/(dashboard)/layout.tsx` | Replace top-nav with sidebar+header layout | HIGH -- all dashboard pages affected |
| `apps/web/src/components/notifications/notification-bell.tsx` | Move into sidebar or header area | LOW -- component stays, placement changes |

**Files Created:**
| File | Purpose |
|------|---------|
| `apps/web/src/components/layout/app-sidebar.tsx` | Sidebar component using shadcn/ui Sidebar primitives |
| `apps/web/src/components/layout/sidebar-nav.tsx` | Navigation items with active state, collapsible groups |
| `apps/web/src/components/layout/header.tsx` | Extracted header (breadcrumb, user menu, notification bell) |

### Architecture Decision: shadcn/ui Sidebar

Use the official shadcn/ui `Sidebar` component. It provides `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarGroup`, `SidebarHeader`, `SidebarFooter`, `SidebarTrigger` -- all composable and themeable.

**Why shadcn/ui Sidebar over custom:**
- Already using shadcn/ui across the app (Popover, Dialog, Card, etc.)
- Built-in collapsible modes: `offcanvas`, `icon`, `none`
- Mobile responsive out of the box
- TypeScript-first, Radix-based accessibility

**Confidence:** HIGH -- shadcn/ui Sidebar is well-documented and the project already uses shadcn/ui extensively.

### Layout Transformation

**Current (top-nav only):**
```
+----------------------------------------------------------+
| Logo | Projects | Metrics | Settings | [Bell] [User] [X] |
+----------------------------------------------------------+
| main content (p-6)                                       |
+----------------------------------------------------------+
```

**Target (sidebar + header):**
```
+--------+------------------------------------------------+
|        | Breadcrumb                    [Bell] [User] [X] |
| LOGO   +------------------------------------------------+
|        |                                                 |
| Proj   |  main content                                   |
| Metrics|                                                 |
| ----   |                                                 |
| Settings|                                                |
| ----   |                                                 |
| [User] |                                                 |
+--------+------------------------------------------------+
```

### Data Flow Change

None. Navigation is purely presentational. Route structure (`(dashboard)/projects`, `(dashboard)/metrics`, etc.) stays identical. The `(dashboard)/layout.tsx` changes its JSX but not its logic.

### Implementation Pattern

```typescript
// apps/web/src/app/(dashboard)/layout.tsx
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // ... existing session/org logic stays identical ...

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b px-6">
          <SidebarTrigger />
          {/* breadcrumb, notification bell, user menu */}
        </header>
        <main className="p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

### Dependencies

- `npx shadcn@latest add sidebar` (adds Sidebar primitives to `components/ui/sidebar.tsx`)
- No new npm packages required -- shadcn/ui generates local components

### Risk: LOW

Pure UI refactor. No API changes. No data model changes. All existing pages render in the same `<main>` slot.

---

## Feature 2: Claude MAX via CLI

### Integration Points

**Files Modified:**
| File | Change | Impact |
|------|--------|--------|
| `apps/api/src/agents/base-agent.ts` | Add CLI execution path alongside SDK `query()` | HIGH -- core agent execution changes |
| `apps/api/src/lib/config.ts` | Add `CLAUDE_EXECUTION_MODE`, `CLAUDE_CLI_PATH` config | LOW |
| `apps/api/src/queues/agent.worker.ts` | No change needed if base-agent abstracts the switch | NONE |
| `packages/database/prisma/schema.prisma` | Add `claudeExecutionMode` to TenantSettings | LOW |
| `apps/api/src/routes/settings.ts` | Expose execution mode toggle | LOW |
| `apps/web/.../settings/page.tsx` | UI for choosing SDK vs CLI mode | LOW |

**Files Created:**
| File | Purpose |
|------|---------|
| `apps/api/src/agents/cli-executor.ts` | Claude CLI subprocess execution wrapper |

### Architecture Decision: Dual-Mode Execution

The existing `base-agent.ts` uses `@anthropic-ai/claude-agent-sdk` in-process. Claude MAX requires the `claude` CLI binary because MAX subscription authentication happens through the CLI, not through API keys.

**Strategy:** Create a parallel execution path that spawns `claude -p` as a subprocess, controlled by a tenant-level or environment-level setting.

**Why dual-mode, not replace:**
- SDK is proven and works reliably for API-key users
- CLI subprocess has known Node.js compatibility issues (see Pitfalls)
- Some tenants may use API keys, others MAX subscription
- Graceful fallback if CLI unavailable

**Confidence:** MEDIUM -- Claude CLI spawning from Node.js has documented issues. The `stdio: 'inherit'` workaround and the `--output-format json` flag provide a path forward, but this needs careful testing.

### Known Issue: Node.js spawn() Hanging

Claude Code CLI hangs when spawned via `child_process.spawn()` with piped stdio. This is a documented issue (GitHub #771, #6295). The root cause is how Claude CLI handles stdin/stdout in subprocess scenarios.

**Workarounds (in priority order):**
1. Use `stdio: ['inherit', 'pipe', 'pipe']` -- stdin inherits, stdout/stderr captured
2. Use `child_process.execFile` with shell: true and explicit timeout
3. Use `--output-format json` flag to get structured output without streaming
4. As last resort: use a thin Python shim that calls subprocess.run() (Python works reliably)

### CLI Executor Design

```typescript
// apps/api/src/agents/cli-executor.ts
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface CLIExecutionParams {
  prompt: string
  cwd?: string
  model?: string
  maxTurns?: number
  allowedTools?: string[]
  systemPrompt?: string
  timeoutMs: number
  jsonSchema?: Record<string, unknown>
}

export interface CLIExecutionResult {
  output: unknown
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
}

export async function executeAgentViaCLI(
  params: CLIExecutionParams
): Promise<CLIExecutionResult> {
  const args: string[] = [
    "--print",
    "--output-format", "json",
    "--dangerously-skip-permissions",
  ]

  if (params.model) args.push("--model", params.model)
  if (params.maxTurns) args.push("--max-turns", String(params.maxTurns))
  if (params.allowedTools?.length) {
    args.push("--allowedTools", ...params.allowedTools)
  }
  if (params.systemPrompt) {
    args.push("--system-prompt", params.systemPrompt)
  }
  if (params.jsonSchema) {
    args.push("--json-schema", JSON.stringify(params.jsonSchema))
  }

  // Prompt goes last
  args.push(params.prompt)

  const startTime = Date.now()
  const env = {
    ...process.env,
    // Force MAX subscription usage (remove API key so CLI uses subscription)
    ANTHROPIC_API_KEY: undefined,
    FORCE_COLOR: "0",
  }

  const { stdout } = await execFileAsync(
    config.CLAUDE_CLI_PATH || "claude",
    args,
    {
      cwd: params.cwd,
      timeout: params.timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50MB for dev agent output
      env,
    }
  )

  const result = JSON.parse(stdout)
  const durationMs = Date.now() - startTime

  return {
    output: result.result, // --output-format json wraps in { result, ... }
    tokensIn: result.usage?.input_tokens ?? 0,
    tokensOut: result.usage?.output_tokens ?? 0,
    costUsd: result.cost_usd ?? 0,
    durationMs,
  }
}
```

### Modified base-agent.ts Pattern

```typescript
// apps/api/src/agents/base-agent.ts -- conceptual change
export async function executeAgent(params: AgentExecutionParams): Promise<AgentExecutionResult> {
  const mode = params.executionMode ?? config.CLAUDE_EXECUTION_MODE ?? "sdk"

  if (mode === "cli") {
    return executeAgentViaCLI({
      prompt: params.prompt,
      cwd: params.cwd,
      model: params.model ?? config.CLAUDE_MODEL,
      maxTurns: params.maxTurns ?? 5,
      allowedTools: params.allowedTools,
      systemPrompt: params.systemPrompt,
      timeoutMs: params.timeoutMs,
      jsonSchema: params.schema,
    })
  }

  // Existing SDK path unchanged
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY required for SDK mode")
  }
  // ... existing query() call ...
}
```

### Data Flow Change

Minimal. The worker calls `executeAgent()` the same way. The switch happens inside base-agent based on config. Agent results have the same shape regardless of execution mode.

```
Worker -> executeAgent(params)
              |
              +-- mode === "sdk" --> query() (existing)
              |
              +-- mode === "cli" --> execFile("claude", [...]) (new)
              |
              v
         AgentExecutionResult (same interface)
```

### Environment Variables Added

```bash
# .env
CLAUDE_EXECUTION_MODE=sdk    # "sdk" (default) or "cli"
CLAUDE_CLI_PATH=claude       # Path to claude binary (default: "claude" on PATH)
```

### Risk: MEDIUM-HIGH

The Node.js subprocess hanging issue is real and documented. Thorough testing required. The `execFile` approach with explicit timeout is safer than `spawn` with piped streams. The `--output-format json` flag avoids streaming issues.

---

## Feature 3: WebSocket Real-Time

### Integration Points

**Files Modified:**
| File | Change | Impact |
|------|--------|--------|
| `apps/api/src/server.ts` | Register `@fastify/websocket` plugin, add WS route | MEDIUM |
| `apps/api/src/plugins/auth.ts` | Export session validation for WS reuse | LOW |
| `apps/api/src/queues/agent.worker.ts` | Emit events after DB updates | MEDIUM |
| `apps/api/src/queues/merge.worker.ts` | Emit events after DB updates | MEDIUM |
| `apps/web/src/lib/api.ts` | No change (REST stays for mutations) | NONE |
| `apps/web/src/components/notifications/notification-bell.tsx` | Replace polling with WS subscription | MEDIUM |
| `apps/web/src/components/board/kanban-board.tsx` | Replace polling with WS subscription | MEDIUM |

**Files Created:**
| File | Purpose |
|------|---------|
| `apps/api/src/lib/ws-manager.ts` | WebSocket connection manager (tenant-scoped rooms) |
| `apps/api/src/routes/ws.ts` | WebSocket route with auth + subscription handling |
| `apps/web/src/lib/ws-client.ts` | Client-side WebSocket wrapper with reconnection |
| `apps/web/src/hooks/use-ws.ts` | React hook for WS subscriptions + TanStack Query invalidation |

### Architecture Decision: @fastify/websocket with Manual Room Management

Use `@fastify/websocket` (built on `ws@8`) rather than Socket.IO. Reasons:

1. **Already Fastify** -- natural plugin, shares server instance, no extra HTTP server
2. **Lightweight** -- ws is ~3KB vs Socket.IO ~47KB. No fallback transports needed (2026 browsers all support WS)
3. **Auth reuse** -- WS upgrade goes through Fastify request lifecycle, so `preValidation` hooks work. The auth plugin can validate session cookies on the upgrade request.
4. **No rooms needed at library level** -- we manage tenant scoping ourselves via a Map<tenantId, Set<WebSocket>>

**Why NOT Socket.IO:**
- Adds a parallel HTTP server or adapter layer
- Namespace/room abstractions add complexity we don't need
- The app has exactly one pub/sub pattern: "push updates to all connections in a tenant"

**Confidence:** HIGH -- @fastify/websocket is mature, version 11.x supports Fastify 5.

### WebSocket Connection Manager

```typescript
// apps/api/src/lib/ws-manager.ts
import type { WebSocket } from "ws"

interface WSConnection {
  ws: WebSocket
  tenantId: string
  userId: string
}

class WSManager {
  // tenantId -> Set of connections
  private rooms = new Map<string, Set<WSConnection>>()

  add(conn: WSConnection) {
    if (!this.rooms.has(conn.tenantId)) {
      this.rooms.set(conn.tenantId, new Set())
    }
    this.rooms.get(conn.tenantId)!.add(conn)
  }

  remove(conn: WSConnection) {
    this.rooms.get(conn.tenantId)?.delete(conn)
  }

  /** Broadcast to all connections in a tenant */
  broadcast(tenantId: string, event: string, data: unknown) {
    const conns = this.rooms.get(tenantId)
    if (!conns) return
    const message = JSON.stringify({ event, data })
    for (const conn of conns) {
      if (conn.ws.readyState === conn.ws.OPEN) {
        conn.ws.send(message)
      }
    }
  }
}

export const wsManager = new WSManager()
```

### Authentication on WS Upgrade

The key insight: `@fastify/websocket` routes go through the normal Fastify request lifecycle. The `preValidation` hook fires BEFORE the upgrade. Since the existing auth plugin is registered on the protectedApp scope, a WS route inside that scope automatically gets session validation.

```typescript
// apps/api/src/routes/ws.ts
import type { FastifyInstance, FastifyRequest } from "fastify"
import { wsManager } from "../lib/ws-manager.js"

export default async function wsRoutes(fastify: FastifyInstance) {
  fastify.get("/ws", { websocket: true }, (socket, request: FastifyRequest) => {
    // request.session and request.prisma are already populated by plugins
    const tenantId = request.session!.session.activeOrganizationId!
    const userId = request.user!.id

    const conn = { ws: socket, tenantId, userId }
    wsManager.add(conn)

    socket.on("close", () => wsManager.remove(conn))
    socket.on("error", () => wsManager.remove(conn))

    // Send initial connection confirmation
    socket.send(JSON.stringify({ event: "connected", data: { tenantId } }))
  })
}
```

**Critical:** The WS route MUST be registered inside the `protectedApp` scope (after authPlugin + tenantPlugin) to get session validation on upgrade. Registration in server.ts:

```typescript
await app.register(async (protectedApp) => {
  await protectedApp.register(authPlugin)
  await protectedApp.register(tenantPlugin)
  // ... existing routes ...
  await protectedApp.register(wsRoutes) // No prefix -- /ws
})
```

**Browser cookie behavior:** WebSocket upgrade requests automatically include cookies from the same origin. Since the frontend makes requests to the API with `credentials: "include"`, the session cookie will be present on the WS upgrade request. No token-in-query-string needed.

### Worker Event Emission

Workers emit events after DB writes. The wsManager is a singleton in the API process, but the worker runs in a SEPARATE process (`worker.ts`). This means **workers cannot directly call `wsManager.broadcast()`**.

**Solution: Redis Pub/Sub bridge.**

Workers publish events to a Redis channel. The API server subscribes and broadcasts to WebSocket clients.

```typescript
// apps/api/src/lib/ws-events.ts (used by worker process)
import IORedis from "ioredis"
import { config } from "./config.js"

const publisher = new IORedis(config.REDIS_URL)

export async function emitWSEvent(tenantId: string, event: string, data: unknown) {
  await publisher.publish("ws-events", JSON.stringify({ tenantId, event, data }))
}
```

```typescript
// apps/api/src/lib/ws-bridge.ts (used by API server process)
import IORedis from "ioredis"
import { config } from "./config.js"
import { wsManager } from "./ws-manager.js"

export function startWSBridge() {
  const subscriber = new IORedis(config.REDIS_URL)
  subscriber.subscribe("ws-events")
  subscriber.on("message", (_channel, message) => {
    const { tenantId, event, data } = JSON.parse(message)
    wsManager.broadcast(tenantId, event, data)
  })
}
```

**API server startup (server.ts):**
```typescript
import { startWSBridge } from "./lib/ws-bridge.js"
// ... after app setup ...
startWSBridge()
```

### Event Types

| Event | Source | Payload | Triggers |
|-------|--------|---------|----------|
| `demand:updated` | agent.worker.ts | `{ demandId, stage, agentStatus }` | Board card moves, detail page updates |
| `demand:completed` | merge.worker.ts | `{ demandId, projectId }` | Board card moves to Done |
| `notification:new` | worker (both) | `{ id, type, title, message }` | Bell count increment, panel update |
| `agent-run:started` | agent.worker.ts | `{ demandId, phase }` | Spinner on card, detail page |
| `agent-run:completed` | agent.worker.ts | `{ demandId, phase, status }` | Card status update |

### Frontend Integration Pattern

```typescript
// apps/web/src/hooks/use-ws.ts
import { useEffect, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3010/ws"

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const { event: eventType, data } = JSON.parse(event.data)

      switch (eventType) {
        case "demand:updated":
          // Invalidate board and demand queries
          queryClient.invalidateQueries({ queryKey: ["demands"] })
          queryClient.invalidateQueries({ queryKey: ["demand", data.demandId] })
          break
        case "notification:new":
          queryClient.invalidateQueries({ queryKey: ["notifications"] })
          break
        // ... etc
      }
    }

    ws.onclose = () => {
      // Reconnect after 3s
      setTimeout(() => { /* reconnect logic */ }, 3000)
    }

    return () => ws.close()
  }, [queryClient])
}
```

**Key insight:** WebSocket does NOT replace TanStack Query. It replaces `refetchInterval` polling. WS events trigger `queryClient.invalidateQueries()` which causes TanStack Query to refetch from REST. This keeps the data fetching layer simple and consistent -- REST for reads/writes, WS for push notifications to invalidate cache.

### Data Flow Change

**Before (polling):**
```
Worker updates DB -> ... 5s passes ... -> Frontend polls /api/demands -> UI updates
```

**After (WS push):**
```
Worker updates DB -> Worker publishes Redis event -> API subscriber receives
  -> wsManager broadcasts to tenant WS clients -> Frontend receives WS message
  -> invalidateQueries() -> TanStack Query refetches from REST -> UI updates
```

Latency drops from 0-5s (polling interval) to ~50ms (Redis pub/sub + WS broadcast + REST refetch).

### Risk: MEDIUM

- Redis Pub/Sub bridge is standard pattern but adds a moving part
- WS reconnection logic needs careful implementation (exponential backoff)
- Must handle case where API restarts but clients have stale WS connections
- Browser WS connection limits (~6 per domain) -- not an issue for single-tab usage

---

## Feature 4: Telegram Bot

### Integration Points

**Files Modified:**
| File | Change | Impact |
|------|--------|--------|
| `packages/database/prisma/schema.prisma` | Add `TelegramConfig` model, extend `NotificationType` enum | MEDIUM |
| `apps/api/src/routes/settings.ts` | Add Telegram bot token + chat ID config endpoints | LOW |
| `apps/web/.../settings/page.tsx` | Add Telegram configuration section | LOW |
| `apps/api/src/queues/agent.worker.ts` | Call notification dispatcher (not Telegram directly) | LOW |
| `apps/api/src/queues/merge.worker.ts` | Call notification dispatcher (not Telegram directly) | LOW |

**Files Created:**
| File | Purpose |
|------|---------|
| `apps/api/src/lib/telegram.ts` | grammY bot instance, message sending |
| `apps/api/src/lib/notification-dispatcher.ts` | Routes notifications to channels (in-app + Telegram) |
| `apps/api/src/routes/telegram.ts` | Webhook endpoint for Telegram (if using webhooks) |

### Architecture Decision: grammY with Long Polling

Use **grammY** over Telegraf for the Telegram bot library.

**Why grammY:**
- Superior TypeScript types (designed TypeScript-first, not migrated)
- Actively maintained, modern API
- Simpler API surface for our use case (sending messages, not building a conversational bot)
- Better documentation

**Why long polling over webhooks:**
- The bot primarily SENDS messages (notifications), not receives them
- Long polling works behind NAT/firewalls (no public URL needed for dev)
- For production, can switch to webhooks by adding a single route
- Simpler initial setup

**Confidence:** HIGH -- grammY is well-documented and our use case (send notifications) is trivial.

### Notification Dispatcher Pattern

Currently, the worker directly creates `Notification` records via Prisma. For multi-channel delivery, introduce a dispatcher that handles routing:

```typescript
// apps/api/src/lib/notification-dispatcher.ts
import { forTenant } from "@techteam/database"
import { sendTelegramNotification } from "./telegram.js"

interface NotificationPayload {
  tenantId: string
  type: "agent_failed" | "merge_needs_human" | "demand_done"
  title: string
  message: string
  demandId?: string
  projectId?: string
}

export async function dispatchNotification(payload: NotificationPayload) {
  const prisma = forTenant(payload.tenantId)

  // 1. Always create in-app notification (existing behavior)
  await (prisma as any).notification.create({
    data: {
      type: payload.type,
      title: payload.title,
      message: payload.message,
      demandId: payload.demandId,
      projectId: payload.projectId,
    },
  })

  // 2. Send Telegram if configured for this tenant
  try {
    const telegramConfig = await (prisma as any).telegramConfig.findFirst()
    if (telegramConfig?.enabled && telegramConfig?.chatId) {
      await sendTelegramNotification(telegramConfig, payload)
    }
  } catch (err) {
    // Never let Telegram failure block the pipeline
    console.warn("[notification] Telegram dispatch failed:", err)
  }

  // 3. Emit WS event (if WS feature is active)
  try {
    const { emitWSEvent } = await import("./ws-events.js")
    await emitWSEvent(payload.tenantId, "notification:new", {
      type: payload.type,
      title: payload.title,
    })
  } catch {
    // WS not required
  }
}
```

### Telegram Module

```typescript
// apps/api/src/lib/telegram.ts
import { Bot } from "grammy"

// Lazy bot instances per tenant (avoid creating bots for unconfigured tenants)
const botCache = new Map<string, Bot>()

function getBot(botToken: string): Bot {
  if (!botCache.has(botToken)) {
    const bot = new Bot(botToken)
    botCache.set(botToken, bot)
  }
  return botCache.get(botToken)!
}

interface TelegramConfig {
  botToken: string
  chatId: string
  enabled: boolean
}

interface NotificationPayload {
  type: string
  title: string
  message: string
  demandId?: string
}

export async function sendTelegramNotification(
  config: TelegramConfig,
  payload: NotificationPayload
) {
  const bot = getBot(config.botToken)

  const emoji = {
    agent_failed: "!!",
    merge_needs_human: ">>",
    demand_done: "OK",
  }[payload.type] || "--"

  const text = `[${emoji}] ${payload.title}\n\n${payload.message}`

  await bot.api.sendMessage(config.chatId, text, { parse_mode: "HTML" })
}
```

### Schema Changes

```prisma
// Add to schema.prisma

model TelegramConfig {
  id        String  @id @default(cuid())
  tenantId  String  @unique
  botToken  String  // Encrypted at rest
  chatId    String
  enabled   Boolean @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
}
```

Also add `TelegramConfig` to the `TENANT_MODELS` array in `packages/database/src/tenant.ts` for auto-tenanting.

### Worker Refactor

Replace direct `notification.create` calls in workers with `dispatchNotification()`:

```typescript
// Before (in agent.worker.ts):
await (prisma as any).notification.create({
  data: { type: "agent_failed", title: "...", message: "...", demandId, projectId }
})

// After:
await dispatchNotification({
  tenantId,
  type: "agent_failed",
  title: "Agent failed: " + phase,
  message: `Agent failed for "${failedDemand.title}" during ${phase} phase.`,
  demandId,
  projectId: failedDemand.projectId,
})
```

This is a simple find-and-replace across ~5 notification creation sites in agent.worker.ts and merge.worker.ts.

### Data Flow Change

**Before:**
```
Worker -> prisma.notification.create() -> DB
Frontend polls /api/notifications/unread-count every 10s
```

**After:**
```
Worker -> dispatchNotification()
            |-> prisma.notification.create() -> DB (unchanged)
            |-> sendTelegramNotification() -> Telegram API -> User's phone
            |-> emitWSEvent() -> Redis -> API -> WS client -> invalidateQueries()
```

### Risk: LOW

- grammY is well-tested, our use case is simple (send messages)
- Telegram bot token stored encrypted like other secrets in TenantSettings
- Fire-and-forget pattern: Telegram failure never blocks the agent pipeline
- User provides their own bot token + chat ID (BotFather setup documented in settings page)

---

## Feature 5: Docker Deployment

### Integration Points

**Files Modified:**
| File | Change | Impact |
|------|--------|--------|
| `docker-compose.yml` | Add api, web, worker services alongside postgres + redis | HIGH |
| `.env.example` | Add Docker-specific env vars | LOW |
| `turbo.json` | No change (build task already defined) | NONE |
| `package.json` | Add docker:build script | LOW |

**Files Created:**
| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Production override (no dev tools, proper restart policies) |
| `apps/api/Dockerfile` | Multi-stage build for API server |
| `apps/web/Dockerfile` | Multi-stage build for Next.js (standalone output) |
| `apps/api/Dockerfile.worker` | Worker process Dockerfile (shares API build but different entrypoint) |
| `.dockerignore` | Exclude node_modules, .git, etc. |

### Architecture Decision: turbo prune + Multi-Stage Builds

Use Turborepo's `turbo prune` to create minimal Docker contexts per app, then multi-stage Docker builds for small images.

**Why turbo prune:**
- Monorepo has shared packages (`@techteam/database`, `@techteam/shared`). Copying the entire repo into Docker is wasteful.
- `turbo prune --scope=@techteam/api --docker` generates a pruned workspace with only the needed packages.
- The `--docker` flag splits output into `json/` (lockfile + package.json for install layer) and `full/` (source code for build layer), optimizing Docker layer caching.

**Confidence:** HIGH -- turbo prune is the documented approach for Turborepo + Docker.

### Dockerfile Pattern: API

```dockerfile
# apps/api/Dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache libc6-compat

# Stage 1: Prune monorepo
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@2
COPY . .
RUN turbo prune @techteam/api --docker

# Stage 2: Install dependencies
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Stage 3: Build
FROM base AS builder
WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@techteam/api
# Generate Prisma client
RUN pnpm --filter @techteam/database db:generate

# Stage 4: Runner
FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 techteam
COPY --from=builder --chown=techteam:nodejs /app/ .
USER techteam

# API server
EXPOSE 3010
CMD ["node", "apps/api/dist/server.js"]
```

### Dockerfile Pattern: Worker

The worker shares the same build as the API (same source, different entrypoint):

```dockerfile
# apps/api/Dockerfile.worker
# Reuses the same build stages as API Dockerfile
# Only difference: CMD

FROM techteam-api-builder AS runner  # Multi-stage reference
# ... same setup ...
CMD ["node", "apps/api/dist/worker.js"]
```

In practice, use a single Dockerfile with a build arg for the entrypoint, or use docker-compose to override the command.

### Docker Compose Extension

```yaml
# docker-compose.prod.yml
services:
  postgres:
    # ... existing config unchanged ...

  redis:
    # ... existing config unchanged ...

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "3010:3010"
    environment:
      DATABASE_URL: postgresql://techteam:techteam_dev@postgres:5432/techteam
      REDIS_URL: redis://redis:6379
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_URL: http://api:3010
      WEB_URL: ${WEB_URL:-http://localhost:3009}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    command: ["node", "apps/api/dist/worker.js"]
    environment:
      DATABASE_URL: postgresql://techteam:techteam_dev@postgres:5432/techteam
      REDIS_URL: redis://redis:6379
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    # Worker needs git for repo operations
    volumes:
      - repos:/app/repos

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3009:3000"
    environment:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:3010}
    depends_on:
      - api
    restart: unless-stopped

volumes:
  techteam_pgdata:
  techteam_redisdata:
  repos:
```

### Critical Considerations

**1. Internal Docker networking:**
- Services communicate via Docker DNS (`postgres`, `redis`, `api`)
- Ports change from host-mapped dev ports (5433, 6380) to container defaults (5432, 6379)
- DATABASE_URL changes from `localhost:5433` to `postgres:5432`

**2. Next.js standalone output:**
- Next.js must be built with `output: "standalone"` in `next.config.ts`
- This produces a minimal `standalone/` directory with a built-in server
- Docker image can be ~150MB instead of ~1GB

**3. Worker git access:**
- The worker needs git and repo access for development/testing/merge phases
- Options: mount host repos via volume, or clone repos inside the container
- Volume mount is simpler for single-server deployment
- For multi-server: worker containers clone from remote on demand

**4. Prisma migrations:**
- Run migrations as a one-off command before starting services
- `docker compose exec api npx prisma migrate deploy`
- Or add a migration init container in compose

**5. Claude CLI in Docker (for MAX mode):**
- If Claude MAX via CLI is used, the claude binary must be installed in the worker container
- `npm install -g @anthropic-ai/claude-code` in the worker Dockerfile
- Authentication: mount `~/.claude` config or set environment variables

### Data Flow Change

No data flow changes. Docker wraps the same processes in containers. The only networking change is service-to-service DNS resolution within the Docker network instead of localhost.

### Risk: MEDIUM

- turbo prune + pnpm + Docker is well-documented but has edge cases with pnpm workspace protocol
- Prisma binary target must match the container OS (linux-musl for Alpine)
- Worker git operations need careful volume mapping
- Hot reload lost in Docker (dev workflow stays native, Docker is for staging/prod)

---

## Component Interaction Map (All Features)

```
+------------------------------------------------------------------+
|                        Frontend (Next.js 15)                       |
|                                                                    |
|  +------------------+  +------------------+  +------------------+  |
|  | AppSidebar       |  | useWebSocket()   |  | Settings Page    |  |
|  | (Feature 1)      |  | (Feature 3)      |  | - Telegram cfg   |  |
|  | sidebar nav      |  | WS -> invalidate |  |   (Feature 4)    |  |
|  +------------------+  | TanStack queries |  | - Claude mode    |  |
|                         +--------+---------+  |   (Feature 2)    |  |
|                                  |            +------------------+  |
+----------------------------------+------+--+-----------------------+
                                   |      |  |
              WebSocket (Feature 3)|      |  | HTTP/REST (existing)
                                   |      |  |
+----------------------------------+------+--+-----------------------+
|                      Fastify 5 API Server                          |
|                                                                    |
|  +------------------+  +------------------+  +------------------+  |
|  | @fastify/websocket|  | WS Bridge       |  | Settings Routes  |  |
|  | ws.ts route      |  | Redis Sub ->     |  | telegram config  |  |
|  | (Feature 3)      |  | wsManager.bcast  |  | claude mode      |  |
|  +------------------+  +--------+---------+  +------------------+  |
|                                  ^                                  |
+----------------------------------+----------------------------------+
                                   |
                          Redis Pub/Sub (Feature 3)
                                   |
+----------------------------------+----------------------------------+
|                       Worker Process                                |
|                                                                    |
|  +------------------+  +------------------+  +------------------+  |
|  | base-agent.ts    |  | notification-    |  | ws-events.ts     |  |
|  | SDK or CLI mode  |  | dispatcher.ts    |  | Redis publish    |  |
|  | (Feature 2)      |  | in-app + TG     |  | (Feature 3)      |  |
|  +------------------+  | (Feature 4)      |  +------------------+  |
|                         +------------------+                        |
+--------------------------------------------------------------------+
                    |
                    | (Docker containers wrap all of the above)
                    | (Feature 5)
```

---

## Suggested Build Order

The features have these dependencies:

```
Feature 1 (Sidebar)    -- no dependencies, pure UI
Feature 2 (Claude CLI) -- no dependencies, backend only
Feature 3 (WebSocket)  -- no hard deps, but benefits from Feature 1 (sidebar already done)
Feature 4 (Telegram)   -- no hard deps, but benefits from Feature 3 (WS event emitter pattern)
Feature 5 (Docker)     -- should be LAST (containerizes final state)
```

**Recommended order:**

1. **Feature 1: Sidebar Navigation** -- Low risk, pure UI, gives immediate visual improvement. Gets the layout refactor done before other features touch components.

2. **Feature 2: Claude MAX via CLI** -- Independent backend work. Can be developed and tested in isolation. Settings UI for mode toggle fits naturally after sidebar is done.

3. **Feature 3: WebSocket** -- Requires Redis Pub/Sub bridge (new pattern). Best done after sidebar so notification bell placement is final. The `invalidateQueries` pattern means existing TanStack Query hooks need minimal changes.

4. **Feature 4: Telegram Bot** -- Builds on the notification dispatcher pattern. If WebSocket is done first, the dispatcher already has the WS emission pattern to follow. Telegram adds another channel to the same abstraction.

5. **Feature 5: Docker Deployment** -- Must be last. It containerizes whatever the final state is. Building Docker images before features are done means rebuilding repeatedly.

### Dependency Rationale

- Sidebar before WebSocket: Layout must be stable before WS-driven updates change notification components
- WebSocket before Telegram: Both use the event emission pattern. Build the bridge once (Redis Pub/Sub), then Telegram hooks into the same dispatcher
- Docker last: Dockerfiles reference specific build outputs. Changing app structure after writing Dockerfiles means rewriting them

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: WebSocket for Mutations

**What:** Using WS to send data changes (create demand, update settings) instead of REST.

**Why bad:** WS has no request/response semantics, no HTTP status codes, no automatic retry. Error handling becomes manual. TanStack Query's mutation features (optimistic updates, retry, error callbacks) are lost.

**Instead:** REST for all mutations. WS only for server-push notifications that trigger cache invalidation.

### Anti-Pattern 2: Eager Bot Instance Creation

**What:** Creating a grammY Bot instance for every tenant on server startup.

**Why bad:** Most tenants won't have Telegram configured. Bot instances hold connections. Memory waste.

**Instead:** Lazy initialization. Create Bot instances on first notification to a configured tenant. Cache them.

### Anti-Pattern 3: Synchronous Telegram in Pipeline

**What:** Awaiting Telegram send in the agent pipeline critical path and failing the job if Telegram is down.

**Why bad:** Telegram API downtime should never block demand processing. The pipeline's job is AI execution, not notification delivery.

**Instead:** Fire-and-forget with try/catch. Log failures. Never re-throw.

### Anti-Pattern 4: Separate Docker Compose Files for Dev and Prod

**What:** Maintaining `docker-compose.dev.yml` and `docker-compose.prod.yml` with duplicated service definitions.

**Why bad:** Config drift. Update one, forget the other.

**Instead:** Base `docker-compose.yml` (infra: postgres + redis) + `docker-compose.prod.yml` (adds app containers with `docker compose -f docker-compose.yml -f docker-compose.prod.yml up`). Dev continues using native `pnpm dev`.

### Anti-Pattern 5: Full Monorepo Copy in Dockerfile

**What:** `COPY . .` without `turbo prune`, copying entire monorepo including unrelated apps.

**Why bad:** Massive Docker images (1GB+). Any change to any file invalidates cache. Slow builds.

**Instead:** `turbo prune --docker` to create minimal workspace. Separate lockfile/source layers for optimal caching.

---

## Sources

**@fastify/websocket:**
- [GitHub - fastify/fastify-websocket](https://github.com/fastify/fastify-websocket) -- HIGH confidence
- [npm - @fastify/websocket](https://www.npmjs.com/package/@fastify/websocket) -- HIGH confidence
- [WebSocket upgrade auth issue #149](https://github.com/fastify/fastify-websocket/issues/149) -- MEDIUM confidence

**Claude Code CLI:**
- [CLI Reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference) -- HIGH confidence
- [Node.js spawn issue #771](https://github.com/anthropics/claude-code/issues/771) -- HIGH confidence (documents the hanging bug)
- [Node.js spawn issue #6295](https://github.com/anthropics/claude-code/issues/6295) -- HIGH confidence

**Claude Agent SDK vs CLI:**
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) -- HIGH confidence
- [SDK vs CLI comparison](https://github.com/shanraisshan/claude-code-best-practice/blob/main/reports/claude-agent-sdk-vs-cli-system-prompts.md) -- MEDIUM confidence

**grammY (Telegram):**
- [grammY Official Site](https://grammy.dev/) -- HIGH confidence
- [grammY Deployment Types](https://grammy.dev/guide/deployment-types) -- HIGH confidence
- [grammY Comparison](https://grammy.dev/resources/comparison) -- HIGH confidence

**Docker + Turborepo:**
- [Turborepo Docker Guide](https://turborepo.dev/docs/guides/tools/docker) -- HIGH confidence
- [pnpm Docker Guide](https://pnpm.io/docker) -- HIGH confidence

**shadcn/ui Sidebar:**
- [Sidebar - shadcn/ui](https://ui.shadcn.com/docs/components/radix/sidebar) -- HIGH confidence
- [Sidebar Blocks](https://ui.shadcn.com/blocks/sidebar) -- HIGH confidence

---

*Architecture research for: TechTeam Platform v1.1 Feature Integration*
*Researched: 2026-02-13*
*Confidence: MEDIUM-HIGH (existing codebase analyzed directly, integration patterns well-understood, Claude CLI subprocess is the main uncertainty)*
