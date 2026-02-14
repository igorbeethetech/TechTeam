# Technology Stack

**Project:** TechTeam Platform v1.1 -- New Feature Stack Additions
**Researched:** 2026-02-13
**Overall Confidence:** HIGH (versions verified via WebSearch against npm/official sources)

> This document covers ONLY new stack additions for v1.1 features. The existing v1.0 stack (Next.js 15, Fastify 5, Prisma 7, BullMQ, Better Auth, TanStack Query, shadcn/ui, etc.) is validated and NOT re-researched here.

---

## Feature 1: Claude MAX Integration (CLI Subprocess)

### Problem

The current `base-agent.ts` uses `@anthropic-ai/claude-agent-sdk` (v0.2.39) which calls the Anthropic API directly, consuming API credits per token. Claude MAX subscribers ($100-200/month) get their usage included in the subscription, but only through the Claude Code CLI -- not the API.

### Recommendation: Dual-mode Agent Execution (SDK + CLI subprocess)

Do NOT replace the existing SDK approach. Instead, add a second execution path that spawns `claude -p` as a child process for users with Claude MAX subscriptions.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js `child_process` (built-in) | N/A (Node 22 built-in) | Spawn `claude -p` CLI process | Zero dependencies. The `spawn` function provides streaming stdout, timeout via `AbortSignal`, and proper cleanup. No npm package needed. |

**Confidence:** HIGH -- Node.js `child_process.spawn` is stable built-in API. Claude CLI `--print` mode and `--output-format stream-json` confirmed in [official docs](https://code.claude.com/docs/en/headless).

### What NOT to Add

| Avoid | Why |
|-------|-----|
| `@anthropic-ai/claude-code` npm package | Deprecated for installation. The npm package has known issues (missing `sdk.mjs` entry point, ENOENT spawn errors in Docker). Install Claude CLI via `claude install` globally instead. |
| `execa` | Unnecessary abstraction. Built-in `child_process.spawn` handles everything needed (streaming, abort, env vars). Adding a dependency for simple subprocess work is over-engineering. |

### Integration Pattern

```typescript
// apps/api/src/agents/cli-executor.ts
import { spawn } from "node:child_process"

export async function executeAgentViaCli(params: {
  prompt: string
  cwd: string
  model?: string
  timeoutMs: number
  allowedTools?: string[]
  systemPrompt?: string
}): Promise<{ output: unknown; durationMs: number }> {
  const args = [
    "-p", params.prompt,
    "--output-format", "json",
    "--model", params.model ?? "sonnet",
  ]

  if (params.allowedTools?.length) {
    args.push("--allowedTools", params.allowedTools.join(","))
  }

  if (params.systemPrompt) {
    args.push("--system-prompt", params.systemPrompt)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs)

  // spawn claude CLI as subprocess
  const child = spawn("claude", args, {
    cwd: params.cwd,
    signal: controller.signal,
    stdio: ["pipe", "pipe", "pipe"],
  })

  // collect stdout, parse JSON on exit
  // ...
}
```

### Config Addition

```typescript
// apps/api/src/lib/config.ts -- add:
CLAUDE_EXECUTION_MODE: optionalEnv("CLAUDE_EXECUTION_MODE", "sdk"), // "sdk" | "cli"
```

### Prerequisites

- Claude CLI must be installed globally on the host/container
- User must be authenticated via `claude login` (MAX subscription)
- For Docker: Claude CLI must be installed in the container image

---

## Feature 2: WebSocket Real-Time Updates

### Problem

Currently 5 polling points with `refetchInterval: 5000`:
- `kanban-board.tsx` (board page and component)
- `demand-detail.tsx` (demand detail page, conditional)
- `agent-run-list.tsx` (agent runs, conditional)
- `notification-bell.tsx` (10s interval)

Polling wastes bandwidth when nothing changes and introduces up to 5s latency for status updates.

### Recommendation: @fastify/websocket + TanStack Query Cache Invalidation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@fastify/websocket** | ^11.0.0 | WebSocket server on Fastify | Official Fastify plugin, built on `ws@8`, respects Fastify hooks (auth decorators work on WS routes), zero config needed beyond `websocket: true` on routes. Already part of the Fastify ecosystem the project uses. |
| **ws** | (transitive via @fastify/websocket) | WebSocket implementation | Installed automatically as peer dep of @fastify/websocket. The standard Node.js WebSocket library -- no need to install separately. |

**Confidence:** HIGH -- @fastify/websocket v11.2.0 confirmed on [npm](https://www.npmjs.com/package/@fastify/websocket), last updated Aug 2025, compatible with Fastify 5.x (peer dep accepts `*`).

### What NOT to Add

| Avoid | Why |
|-------|-----|
| **Socket.IO** | Adds 50KB+ to client bundle, requires its own client library, uses a custom protocol on top of WebSocket. Overkill for this use case (server-to-client push notifications, not bidirectional chat). @fastify/websocket is lighter, integrates natively, and the built-in browser `WebSocket` API is sufficient as client. |
| **@tanstack/react-query-websocket** | Does not exist. The pattern is to use native WebSocket on the client and call `queryClient.invalidateQueries()` on incoming messages -- no adapter library needed. |
| **react-use-websocket** | Unnecessary abstraction. A simple custom hook (20 lines) with `useEffect` + `WebSocket` + auto-reconnect is cleaner than adding a dependency for this straightforward use case. |

### Architecture: Event-Based Invalidation (NOT full data push)

Use WebSocket to push lightweight event notifications, then let TanStack Query refetch the data. This avoids duplicating the REST API data shape over WebSocket and keeps a single source of truth.

```
Worker creates notification --> Redis PubSub --> API WS handler --> Client WebSocket
                                                                       |
                                                            queryClient.invalidateQueries()
                                                                       |
                                                            TanStack Query refetches via REST
```

**Why Redis PubSub for worker-to-API bridge:** BullMQ workers run in a separate process (`dev:worker`). They cannot directly access Fastify's WebSocket connections. Redis PubSub (using the existing `ioredis` dependency) bridges the gap -- workers publish events, the API server subscribes and forwards to connected WebSocket clients.

### Client-Side Pattern

```typescript
// apps/web/src/hooks/useRealtimeEvents.ts
function useRealtimeEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws/events`)

    ws.onmessage = (event) => {
      const { type, demandId, projectId } = JSON.parse(event.data)

      // Surgical invalidation based on event type
      if (type === "demand_updated") {
        queryClient.invalidateQueries({ queryKey: ["demands", projectId] })
        queryClient.invalidateQueries({ queryKey: ["demand", demandId] })
      }
      if (type === "notification") {
        queryClient.invalidateQueries({ queryKey: ["notifications"] })
      }
    }

    ws.onclose = () => {
      // Auto-reconnect with backoff
      setTimeout(() => reconnect(), 3000)
    }

    return () => ws.close()
  }, [queryClient])
}
```

### Installation

```bash
# Backend only -- no frontend package needed (browser WebSocket API)
cd apps/api
pnpm add @fastify/websocket
```

---

## Feature 3: Telegram Bot Notifications

### Problem

The platform already creates `Notification` records in PostgreSQL for `agent_failed`, `merge_needs_human`, and `demand_done` events. But users only see them when they open the web UI. Telegram provides push notifications to mobile.

### Recommendation: grammY (Telegram Bot Framework)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **grammy** | ^1.40.0 | Telegram Bot API framework | TypeScript-first, actively maintained (updated Feb 2026), lightweight (~40KB), works with Node.js natively. Significantly better DX than `node-telegram-bot-api` (callback-based, less maintained) or `telegraf` (heavier, more opinionated). grammY is the modern standard for Node.js Telegram bots. |

**Confidence:** HIGH -- grammy v1.40.0 confirmed on [npm](https://www.npmjs.com/package/grammy), actively maintained (published within the last day of research).

### What NOT to Add

| Avoid | Why |
|-------|-----|
| **telegraf** | Heavier, more opinionated middleware system. grammY was created by a telegraf contributor specifically to address its shortcomings. grammY has better TypeScript types, more active maintenance, and simpler API. |
| **node-telegram-bot-api** | Callback-based API, no TypeScript types, last meaningful update years ago. Not suitable for modern async/await TypeScript codebases. |

### Integration: Send-Only (No Polling/Webhook Needed)

The Telegram bot is notification-only (outbound messages). It does NOT need to receive messages from users. This means:
- No webhook setup required
- No long polling required
- No public URL or SSL certificate needed
- Just call `bot.api.sendMessage(chatId, text)` from workers

```typescript
// apps/api/src/lib/telegram.ts
import { Bot } from "grammy"

let bot: Bot | null = null

export function getTelegramBot(): Bot | null {
  if (!config.TELEGRAM_BOT_TOKEN) return null
  if (!bot) {
    bot = new Bot(config.TELEGRAM_BOT_TOKEN)
  }
  return bot
}

export async function sendTelegramNotification(
  chatId: string,
  message: string
) {
  const bot = getTelegramBot()
  if (!bot) return // Telegram not configured, skip silently

  await bot.api.sendMessage(chatId, message, { parse_mode: "Markdown" })
}
```

### Where It Hooks In

The existing worker notification creation points (`agent.worker.ts` lines 261-280, `merge.worker.ts` lines 135-145, 334-342) already create `Notification` records. Add a `sendTelegramNotification()` call after each `notification.create()`:

```typescript
// After notification.create in workers:
await sendTelegramNotification(
  tenantSettings.telegramChatId,
  `*${notification.title}*\n${notification.message}`
)
```

### Config Addition

```typescript
// apps/api/src/lib/config.ts -- add:
TELEGRAM_BOT_TOKEN: optionalEnv("TELEGRAM_BOT_TOKEN", ""),
```

### Database Addition

```prisma
// packages/database/prisma/schema.prisma -- add to TenantSettings:
model TenantSettings {
  // ... existing fields
  telegramChatId  String?   // Telegram chat/group ID for notifications
}
```

### Installation

```bash
cd apps/api
pnpm add grammy
```

---

## Feature 4: Docker Production Deploy

### Problem

Current `docker-compose.yml` only runs PostgreSQL and Redis. The Node.js apps (API, web, worker) run directly on the host. For VPS deployment, all services need containerization.

### Recommendation: Multi-Stage Docker Builds with `turbo prune`

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Docker** (multi-stage) | 24+ | Container runtime | Industry standard. Multi-stage builds reduce image size by 60-80% compared to single-stage. |
| **Node 22 Alpine** | 22-alpine | Base image | Matches project's `engines.node: ">=22.0.0"`. Alpine reduces image from ~1GB to ~180MB. |
| **turbo prune** | (existing turbo ^2.8.0) | Monorepo workspace pruning | Built into Turborepo already installed. `turbo prune @techteam/api --docker` outputs only the workspaces needed for a specific app, optimizing Docker layer caching. |
| **pnpm deploy** | (existing pnpm 10.28.2) | Production dependency isolation | `pnpm deploy --filter @techteam/api --prod ./deploy` copies only production node_modules for a specific workspace. Avoids installing devDependencies in production image. |

**Confidence:** HIGH -- `turbo prune --docker` is documented on [turborepo.dev](https://turborepo.dev/docs/guides/tools/docker). pnpm deploy is documented on [pnpm.io](https://pnpm.io/docker). Docker multi-stage builds are industry standard.

### What NOT to Add

| Avoid | Why |
|-------|-----|
| **Kubernetes / k8s** | Massive overkill for a single-VPS deployment. Docker Compose handles multi-container orchestration on a single host perfectly. |
| **Docker Swarm** | Unnecessary for single-node deployment. Plain Docker Compose with restart policies is sufficient. |
| **Nginx reverse proxy** | Not needed initially. Caddy (below) is simpler for HTTPS/reverse proxy. But even Caddy can be deferred -- start with direct port exposure. |
| **Caddy** | Consider for HTTPS termination in a future iteration, but not a v1.1 requirement. Docker Compose port mapping is sufficient for VPS with a domain pointed at it. |

### Dockerfile Strategy: 3 Images

1. **apps/api** -- Fastify API server + BullMQ worker (or separate worker image)
2. **apps/web** -- Next.js standalone output
3. **Shared base** -- pnpm + turbo prune stage (cached layer)

### Next.js Standalone Mode

Add to `apps/web/next.config.ts`:

```typescript
const nextConfig = {
  output: "standalone",
  // ... existing config
}
```

This creates a self-contained `.next/standalone/` folder with only production dependencies (~50MB vs ~500MB full node_modules). The standalone server runs with just `node server.js`.

### Production docker-compose.yml Structure

```yaml
services:
  postgres:
    image: postgres:16-alpine
    # ... (existing, unchanged)

  redis:
    image: redis:7-alpine
    # ... (existing, unchanged)

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    environment:
      DATABASE_URL: postgresql://techteam:${DB_PASSWORD}@postgres:5432/techteam
      REDIS_URL: redis://redis:6379
    ports:
      - "3010:3010"

  worker:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    command: ["node", "dist/worker.js"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    depends_on:
      - api
    ports:
      - "3009:3000"
```

### Installation

No new npm packages required. Docker and Docker Compose are infrastructure-level tools already present.

---

## Feature 5: Jira-Style Sidebar Navigation

### Problem

Current layout uses a top horizontal nav bar with links (Projects, Metrics, Settings). No project context persistence, no collapsible sidebar, no quick project switching.

### Recommendation: shadcn/ui Sidebar Component

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **shadcn/ui Sidebar** | N/A (copy-paste, not versioned) | Collapsible sidebar with icon mode | Already in the shadcn/ui ecosystem the project uses. The `sidebar` component provides `SidebarProvider`, collapsible modes (`icon`, `offcanvas`, `none`), `SidebarTrigger`, and composable sub-components. No new npm dependency -- it uses existing Radix UI primitives already installed. |

**Confidence:** HIGH -- shadcn/ui sidebar confirmed available via `npx shadcn add sidebar` at [ui.shadcn.com](https://ui.shadcn.com/docs/components/radix/sidebar). Uses existing `radix-ui` (already v1.4.3 in web package.json).

### What NOT to Add

| Avoid | Why |
|-------|-----|
| **Zustand** (for sidebar state) | shadcn/ui sidebar uses its own `useSidebar()` hook backed by React Context. Adding Zustand for sidebar collapse state is unnecessary complexity. |
| **react-resizable-panels** | The sidebar does not need free-form resizing. shadcn's two-state collapse (full/icon) is the Jira pattern. Resizable panels add complexity without matching the UX goal. |
| **Custom sidebar implementation** | shadcn/ui sidebar is purpose-built for exactly this pattern and integrates with the existing component library. Building from scratch would be slower and inconsistent. |

### Installation

```bash
cd apps/web
npx shadcn add sidebar
```

This scaffolds the sidebar components into `src/components/ui/sidebar.tsx` and adds any missing Radix primitives (likely none -- `radix-ui` v1.4.3 already covers them).

### Sidebar Structure

```
+----------------------------------+
| Logo  [collapse toggle]         |
+----------------------------------+
| Project Switcher                 |
|   [Current Project v]           |
+----------------------------------+
| Board         (Kanban icon)     |
| Demands       (List icon)      |
| Metrics       (BarChart icon)  |
+----------------------------------+
| Settings      (Gear icon)      |
| Notifications (Bell icon)      |
+----------------------------------+
| User avatar + name              |
| Logout                          |
+----------------------------------+
```

When collapsed to icon mode, only icons show. Hover expands temporarily.

---

## Complete Installation Summary

### New Backend Dependencies (apps/api)

```bash
cd apps/api
pnpm add @fastify/websocket grammy
```

**Total: 2 new packages.**

### New Frontend Dependencies (apps/web)

```bash
cd apps/web
npx shadcn add sidebar
```

**Total: 0 new npm packages** (shadcn sidebar uses existing Radix UI primitives).

### Config Additions (.env)

```bash
# Claude MAX CLI mode (optional, defaults to SDK mode)
CLAUDE_EXECUTION_MODE=sdk  # "sdk" | "cli"

# Telegram notifications (optional)
TELEGRAM_BOT_TOKEN=
```

### Database Additions (schema.prisma)

```prisma
model TenantSettings {
  // ... existing fields
  telegramChatId  String?
}
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **WebSocket server** | @fastify/websocket | Socket.IO | Socket.IO adds its own client lib (50KB+), custom protocol, rooms/namespaces we don't need. @fastify/websocket is lighter, native Fastify integration, standard WebSocket protocol. |
| **WebSocket server** | @fastify/websocket | fastify-uws (uWebSockets.js) | uWebSockets.js is C++ based, harder to debug, has licensing concerns. Performance difference is negligible at our scale (<100 concurrent connections). |
| **Telegram bot** | grammY | telegraf | telegraf is heavier, more opinionated middleware. grammY was built to improve on telegraf with better TS types and simpler API. |
| **Telegram bot** | grammY | Telegram Bot API (raw HTTP) | Raw HTTP works but requires building request/response types, error handling, rate limiting manually. grammY wraps this cleanly in ~40KB. |
| **CLI subprocess** | Node.js `child_process` | execa | execa adds a dependency for functionality that `spawn` handles natively. The API surface we need is minimal (spawn, stdout stream, abort). |
| **Docker strategy** | turbo prune + multi-stage | Standalone Dockerfiles per app | Without turbo prune, each Dockerfile would need to COPY the entire monorepo, breaking Docker layer caching and producing bloated images. |
| **Sidebar** | shadcn/ui sidebar | Custom CSS sidebar | shadcn sidebar handles keyboard navigation, focus management, mobile responsive, collapse animation -- all accessibility concerns we'd have to build manually. |

## Dependency Impact Assessment

| Metric | Before v1.1 | After v1.1 | Delta |
|--------|-------------|------------|-------|
| Backend npm deps | 14 | 16 | +2 (@fastify/websocket, grammy) |
| Frontend npm deps | 20 | 20 | +0 (shadcn sidebar is code, not a package) |
| New env vars | 0 | 2 | CLAUDE_EXECUTION_MODE, TELEGRAM_BOT_TOKEN |
| New DB columns | 0 | 1 | TenantSettings.telegramChatId |
| New Dockerfiles | 0 | 2 | apps/api/Dockerfile, apps/web/Dockerfile |
| New compose services | 2 | 4 | +api, +web (worker can share api image) |

---

## Version Compatibility Matrix

| Package | Version | Compatible With | Verified |
|---------|---------|-----------------|----------|
| @fastify/websocket | ^11.0.0 | Fastify 5.x (peer dep: `*`) | YES via npm |
| grammy | ^1.40.0 | Node.js 18+ | YES via npm |
| turbo prune | built into turbo ^2.8.0 | pnpm workspaces | YES (existing) |
| Next.js standalone | built into next ^15.3.0 | Node.js 22 | YES (Next.js docs) |
| Node 22 Alpine | 22-alpine | All project deps | YES (engines field) |
| shadcn sidebar | N/A | radix-ui ^1.4.3 | YES (already installed) |

---

## Sources

### Verified (HIGH confidence)
- [@fastify/websocket on npm](https://www.npmjs.com/package/@fastify/websocket) -- v11.2.0, Fastify 5 compatible
- [grammY on npm](https://www.npmjs.com/package/grammy) -- v1.40.0, actively maintained
- [Claude Code headless docs](https://code.claude.com/docs/en/headless) -- `-p`/`--print` flag, `--output-format json`
- [Turborepo Docker guide](https://turborepo.dev/docs/guides/tools/docker) -- `turbo prune --docker`
- [shadcn/ui sidebar docs](https://ui.shadcn.com/docs/components/radix/sidebar) -- component API, collapsible modes
- [Next.js standalone output](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output) -- `output: "standalone"`

### Verified via community (MEDIUM confidence)
- [Claude MAX subscription details](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan) -- CLI usage included in subscription
- [TanStack Query + WebSocket pattern](https://tkdodo.eu/blog/using-web-sockets-with-react-query) -- invalidateQueries approach by TkDodo (TanStack maintainer)
- [grammY deployment types](https://grammy.dev/guide/deployment-types) -- webhook vs polling considerations

### Known Issues Flagged
- Claude CLI spawn ENOENT errors in Docker containers ([GitHub #4383](https://github.com/anthropics/claude-code/issues/4383)) -- needs careful PATH management in Dockerfile
- Claude MAX usage limits are weekly, not truly unlimited ([GitHub #16157](https://github.com/anthropics/claude-code/issues/16157)) -- plan for fallback to SDK mode

---

*Stack research for: TechTeam Platform v1.1 features*
*Researched: 2026-02-13*
*Confidence: HIGH (all versions verified against npm/official docs)*
