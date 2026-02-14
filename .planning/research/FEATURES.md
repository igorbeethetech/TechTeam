# Feature Landscape: v1.1 New Features

**Domain:** AI Agent Orchestration Platform -- UX Overhaul + Production Readiness
**Researched:** 2026-02-13
**Scope:** Sidebar navigation, clickable cards, Claude MAX, WebSocket, Telegram bot, Docker deploy

---

## 1. Jira-Style Sidebar Navigation with Project Switcher

### Expected Behavior

Users expect a persistent left sidebar that replaces the current top-nav header. The sidebar provides hierarchical navigation: workspace-level items (metrics, settings) at the bottom, project-specific boards accessible from a project switcher at the top.

**Standard UX pattern:**

| Element | Behavior |
|---------|----------|
| **Sidebar container** | Fixed left, 240-280px wide when expanded, 48-64px when collapsed (icon-only mode) |
| **Collapse toggle** | Button at sidebar bottom or top; persists user preference to localStorage |
| **Project switcher** | Dropdown or popover at sidebar top showing all org projects; selected project highlights; quick-create option |
| **Project items** | When a project is selected: Board, Demands list, Settings appear as nav items indented under project |
| **Global items** | Dashboard (home), Metrics, Settings, Notifications always visible regardless of selected project |
| **Mobile** | Sidebar becomes off-canvas overlay (sheet), triggered by hamburger icon |
| **Active state** | Current page highlighted in sidebar with background color + bold text |
| **Keyboard** | `Cmd+K` or `Cmd+/` for quick project/navigation search (stretch goal) |

**What changes from current layout:**
- Current: `<header>` top bar with `<nav>` links (Projects, Metrics, Settings) + notification bell + user info
- New: Left sidebar takes over navigation; header shrinks to breadcrumb + user actions only, or merges into sidebar

### Complexity: MEDIUM

- shadcn/ui has a full Sidebar component (SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarTrigger, SidebarFooter) with collapsible modes: `offcanvas`, `icon`, `none`
- The `useSidebar` hook provides state management (open, setOpen, toggleSidebar, isMobile)
- Main challenge: refactoring `(dashboard)/layout.tsx` from horizontal nav to sidebar layout without breaking existing routes
- Project switcher requires fetching projects list and storing selected project in URL params or context

**Confidence:** HIGH -- shadcn/ui Sidebar is a first-class component with extensive documentation and block examples.

### Dependencies on Existing

| Existing Feature | Relationship |
|------------------|-------------|
| `(dashboard)/layout.tsx` | **Rewrite** -- current top-nav header replaced with sidebar layout |
| Project list API (`/api/projects`) | **Reuse** -- sidebar fetches same project list |
| Route structure `(dashboard)/projects/[projectId]/board` | **Reuse** -- sidebar links point to existing routes |
| NotificationBell component | **Move** -- relocates from header to sidebar footer or stays in reduced header |

---

## 2. Clickable Demand Cards (Navigate on Text, Drag on Handle)

### Expected Behavior

Currently, the `DemandCard` component uses `<KanbanItem asHandle>` which makes the entire card a drag handle. Navigation is via a tiny `<ExternalLink>` icon with `stopPropagation`. Users expect to click on the card text/body to navigate to the detail page, while drag-and-drop still works by grabbing the card edge or a dedicated drag handle.

**Standard UX pattern:**

| Interaction | Expected Result |
|-------------|----------------|
| **Click on card text/title** | Navigate to `/demands/{id}` detail page |
| **Click and hold, then drag** | Initiate drag-and-drop to move between columns |
| **Quick click (no drag)** | Always navigates, never triggers drop |
| **Touch on mobile** | Tap navigates; long-press + drag moves card |

**Implementation approach:**

The core fix is removing `asHandle` from `<KanbanItem>` so the entire item is NOT a drag handle, then using dnd-kit's separate handle concept. Two patterns:

1. **Separate drag handle area**: Add a small grip icon (6-dot grip or `GripVertical` from lucide-react) on the left edge of the card. Only that area is draggable. The rest of the card is a `<Link>` to the detail page.

2. **Sensor-based approach**: Use dnd-kit's `PointerSensor` with `activationConstraint: { distance: 8 }` so short clicks navigate and only movement beyond 8px activates drag. This is the more seamless UX but can feel ambiguous.

**Recommended:** Pattern 1 (separate drag handle) because it is unambiguous. Users see the grip icon and know "grab here to drag." Clicking anywhere else on the card navigates. This is the pattern used by Jira, Linear, Notion, and Trello.

### Complexity: LOW

- Remove `asHandle` from `<KanbanItem>`
- Add `<KanbanItemHandle>` component (or equivalent) wrapping a grip icon
- Wrap card text in `<Link href={/demands/${demand.id}}>`
- Ensure `stopPropagation` on the Link's pointer events does not interfere with drag
- May need dnd-kit's `useSortable` hook with explicit `listeners` only on the handle element

**Confidence:** HIGH -- dnd-kit explicitly supports separate handles via `listeners` prop. The current Kanban UI component already has `KanbanItemHandle` concept.

### Dependencies on Existing

| Existing Feature | Relationship |
|------------------|-------------|
| `demand-card.tsx` | **Modify** -- add grip handle, wrap text in Link |
| `kanban-board.tsx` | **Modify** -- remove `asHandle` from KanbanItem, pass handle listeners separately |
| `@dnd-kit/core` and `@dnd-kit/sortable` | **Reuse** -- handle pattern is built-in |
| Demand detail page (`/demands/[demandId]`) | **Reuse** -- no changes needed |

---

## 3. Claude MAX Integration (API Key vs Subscription Toggle)

### Expected Behavior

Users who have a Claude MAX subscription ($100-200/mo) can use it for agent execution instead of a pay-per-token API key. The Settings page should let the tenant choose their execution mode.

**Standard behavior based on research:**

| Aspect | API Key Mode (Current) | MAX Subscription Mode (New) |
|--------|------------------------|----------------------------|
| **Authentication** | `ANTHROPIC_API_KEY` env var | `CLAUDE_CODE_OAUTH_TOKEN` env var |
| **Cost model** | Pay-per-token (metered) | Flat monthly fee (included in subscription) |
| **Configuration** | Tenant enters API key in Settings | Admin runs `claude setup-token` on server, enters token in Settings |
| **SDK compatibility** | Claude Agent SDK `query()` uses API key automatically | Claude Agent SDK `query()` uses OAuth token when `CLAUDE_CODE_OAUTH_TOKEN` is set and no `ANTHROPIC_API_KEY` is present |
| **Rate limits** | API rate limits (tokens/min, requests/min) | Shared with claude.ai usage; subject to MAX plan limits |
| **Token tracking** | Accurate per-request (returned by SDK) | Still reported by SDK, but not billed per-token |

**Critical constraints discovered:**

1. **Policy restriction (Jan 2026):** Anthropic does not allow third-party developers to offer claude.ai login or rate limits for their products via OAuth, unless previously approved. The supported path for third-party tools is the API key. However, TechTeam is not a "third-party harness" -- it is the tenant's own deployment using their own subscription. This is a gray area that needs monitoring.

2. **Authentication priority:** Claude Code prioritizes `ANTHROPIC_API_KEY` over `CLAUDE_CODE_OAUTH_TOKEN`. If both exist, API key wins. The backend must ensure only one is set per execution context.

3. **Token refresh:** OAuth tokens expire and need refresh. The `claude setup-token` command generates a token, but for long-running server processes, token refresh reliability is a concern.

4. **12-second startup overhead:** The Agent SDK `query()` function has ~12 seconds startup overhead due to CLI process initialization. This exists for BOTH auth methods and is not specific to MAX.

**Settings UI expected flow:**

1. Settings page shows radio/toggle: "API Key" vs "Claude MAX Subscription"
2. If API Key selected: existing text input for `sk-ant-xxxxx`
3. If MAX selected: text input for OAuth token (generated via `claude setup-token` on the server)
4. Backend `base-agent.ts` reads tenant settings to determine which env var to pass to the SDK
5. Cost tracking still works (SDK reports token usage regardless of billing method), but cost display should note "included in subscription" for MAX mode

### Complexity: MEDIUM-HIGH

- Schema change: add `executionMode` ("api_key" | "claude_max") and `claudeOauthToken` to TenantSettings
- Settings page: add mode toggle UI
- `base-agent.ts` (`executeAgent`): must dynamically set auth based on tenant settings (currently uses global `config.ANTHROPIC_API_KEY`)
- **Key challenge**: The Agent SDK reads from environment variables. Per-tenant auth means either (a) spawning the SDK process with tenant-specific env vars, or (b) finding an SDK parameter for auth override. The current `query()` call does not expose an `apiKey` parameter -- it reads from env.
- This may require spawning the agent process with modified env: `{ ANTHROPIC_API_KEY: tenantApiKey }` or `{ CLAUDE_CODE_OAUTH_TOKEN: tenantOauthToken }` per job

**Confidence:** MEDIUM -- The SDK's `query()` function works with both auth methods, but per-tenant dynamic switching at runtime needs validation. The env-var-based auth of the SDK is not designed for multi-tenant scenarios. May need process-level isolation per tenant execution.

### Dependencies on Existing

| Existing Feature | Relationship |
|------------------|-------------|
| `TenantSettings` model | **Extend** -- add executionMode, claudeOauthToken fields |
| Settings page (`settings/page.tsx`) | **Extend** -- add mode toggle, OAuth token input |
| `base-agent.ts` (`executeAgent`) | **Modify** -- pass tenant-specific auth to SDK |
| `agent.worker.ts` | **Modify** -- fetch tenant settings before agent execution, set env vars |
| `config.ts` | **Modify** -- global ANTHROPIC_API_KEY becomes fallback only |

---

## 4. WebSocket Real-Time (Replacing Polling)

### Expected Behavior

Replace the current polling pattern (5s Kanban, 10s notifications) with WebSocket push for instant updates. When an agent completes a phase, the board and notifications update within 100-300ms instead of waiting up to 5-10 seconds.

**Current polling points to replace:**

| Component | Current Pattern | New Pattern |
|-----------|----------------|-------------|
| `kanban-board.tsx` | `refetchInterval: 5000` via react-query | WebSocket event `demand:updated` triggers query invalidation |
| `notification-bell.tsx` | `refetchInterval: 10_000` for unread count | WebSocket event `notification:new` pushes count + data |
| Demand detail page | `staleTime: 0` with manual refetch | WebSocket event `demand:{id}:updated` pushes changes |
| Agent run status | Polling via demand detail | WebSocket event `agent-run:updated` pushes status changes |

**Standard WebSocket architecture for this stack:**

1. **Server**: `@fastify/websocket` plugin on the existing Fastify server. Register a WebSocket route (e.g., `GET /ws`) that upgrades the connection.

2. **Authentication**: On WebSocket connection, validate the session cookie (same cookie sent to REST API). Extract tenantId from session. Reject unauthenticated connections.

3. **Rooms/Channels**: Use a Map-based room system (no need for Socket.IO rooms):
   - `tenant:{tenantId}` -- all notifications for the org
   - `project:{projectId}` -- board updates for a specific project
   - `demand:{demandId}` -- detail page updates for a specific demand
   - Client sends a `subscribe` message specifying which rooms to join

4. **Server-side emission**: When the agent worker updates a demand stage, notification, etc., it publishes to Redis pub/sub. The WebSocket server subscribes to Redis and broadcasts to connected clients in the appropriate room.

5. **Client**: A singleton WebSocket connection manager (React context or module-level). On receiving events, invalidate the relevant react-query cache keys so data refetches, OR directly update the cache with the pushed data.

6. **Fallback**: Keep polling as fallback if WebSocket disconnects. react-query's `refetchInterval` can be conditionally enabled when WS is disconnected.

**Message format (server to client):**
```json
{
  "event": "demand:updated",
  "data": { "demandId": "xxx", "stage": "testing", "agentStatus": "running" }
}
```

```json
{
  "event": "notification:new",
  "data": { "id": "xxx", "type": "demand_done", "title": "...", "unreadCount": 5 }
}
```

### Complexity: MEDIUM-HIGH

- `@fastify/websocket` installation and route registration
- Session validation on WS upgrade (parse cookies, verify session via Better Auth)
- Room management system (Map of tenantId/projectId to Set of WebSocket connections)
- Redis pub/sub for cross-process communication (agent worker -> API server)
- Client-side WebSocket manager with reconnection logic
- Integration with react-query (invalidation or direct cache updates)
- Graceful degradation to polling when WS unavailable

**Confidence:** HIGH -- `@fastify/websocket` is the official Fastify plugin, uses the `ws` library under the hood, and works with the same server instance. Redis pub/sub is already available (BullMQ uses Redis). The pattern is well-established.

### Dependencies on Existing

| Existing Feature | Relationship |
|------------------|-------------|
| Fastify server (`server.ts`) | **Extend** -- register @fastify/websocket plugin, add /ws route |
| Auth plugin (`plugins/auth.ts`) | **Reuse** -- WS handler validates same session cookie |
| Redis (`lib/redis.ts`) | **Extend** -- add pub/sub channels alongside BullMQ queues |
| `agent.worker.ts` | **Modify** -- publish events to Redis pub/sub after demand/notification updates |
| `merge.worker.ts` | **Modify** -- publish events to Redis pub/sub after merge updates |
| `kanban-board.tsx` | **Modify** -- subscribe to project room, use WS events for cache invalidation |
| `notification-bell.tsx` | **Modify** -- subscribe to tenant room, update count on WS events |
| react-query setup | **Extend** -- add WebSocket context provider for global connection management |

---

## 5. Telegram Bot Notifications

### Expected Behavior

Users link their Telegram account in Settings, then receive pipeline event notifications (agent failures, demand completion, merge needing human intervention) as Telegram messages.

**Standard Telegram bot UX:**

| Step | User Action | System Behavior |
|------|-------------|-----------------|
| **1. Setup** | Admin creates bot via @BotFather in Telegram | Gets bot token; stored in env or TenantSettings |
| **2. Link account** | User clicks "Link Telegram" in Settings, sees a deep link `https://t.me/{bot_username}?start={link_token}` | App generates a unique one-time link token associated with the user/tenant |
| **3. Activate** | User opens link in Telegram, sends `/start` | Bot receives the start command with link_token, maps Telegram chatId to the user/tenant in DB |
| **4. Confirm** | System shows "Telegram linked" in Settings | TenantSettings stores telegramChatId; Settings UI shows linked status |
| **5. Receive** | Notifications arrive in Telegram chat | Bot sends formatted messages for configured event types |
| **6. Unlink** | User clicks "Unlink" in Settings | Removes telegramChatId; stops messages |

**Notification types to forward:**

| Event | Telegram Message |
|-------|-----------------|
| `agent_failed` | "Agent failed during {phase} for demand '{title}'. Check dashboard." |
| `merge_needs_human` | "Merge conflict needs human resolution for '{title}'. Review required." |
| `demand_done` | "Demand '{title}' completed and merged successfully." |

**Technology choice: grammY** because:
- Superior TypeScript support (type-safe Bot API)
- Lighter than Telegraf, actively maintained
- Built-in webhook adapter (production) and long-polling (development)
- Works well with Fastify via `webhookCallback('fastify')`

**Production deployment:**
- Use webhooks in production (not long polling) -- the Fastify server exposes a `/telegram/webhook` endpoint
- Telegram sends POST requests to this endpoint when users interact with the bot
- Requires HTTPS (the Docker/VPS deploy with reverse proxy handles this)
- For development, use long polling (no public URL needed)

### Complexity: MEDIUM

- grammY library setup with bot token
- Schema: add `telegramChatId` and `telegramLinkToken` to user or TenantSettings
- Settings UI: "Link Telegram" button generating deep link, status indicator
- Bot command handler: `/start {linkToken}` to associate chatId
- Notification emission: extend `agent.worker.ts` and `merge.worker.ts` to call Telegram send after creating in-app notification
- Webhook route registration in Fastify for production; long-polling for dev
- Message formatting (Markdown or HTML for Telegram messages)

**Confidence:** HIGH -- grammY is well-documented, the webhook pattern with Fastify is straightforward, and the Telegram Bot API is stable and simple.

### Dependencies on Existing

| Existing Feature | Relationship |
|------------------|-------------|
| Notification system (`agent.worker.ts`, `merge.worker.ts`) | **Extend** -- after creating Notification record, also send Telegram if linked |
| TenantSettings model | **Extend** -- add telegramBotToken, per-user telegramChatId |
| Settings page | **Extend** -- add Telegram link/unlink section |
| Prisma schema | **Extend** -- may need per-user telegram mapping (not just per-tenant) |
| Fastify server | **Extend** -- add webhook route for Telegram callbacks |

---

## 6. Docker Production Deploy

### Expected Behavior

The entire monorepo (API + Web + Worker + Postgres + Redis) runs as a set of Docker containers on a VPS, orchestrated by docker-compose. A single `docker compose up -d` brings the entire platform online.

**Current state:**
- `docker-compose.yml` exists with only Postgres and Redis (development infrastructure)
- No Dockerfiles exist for the application code
- No production configuration

**Expected production docker-compose architecture:**

| Service | Base Image | Purpose | Port |
|---------|------------|---------|------|
| `api` | `node:22-alpine` | Fastify API server | 3010 |
| `worker` | `node:22-alpine` | BullMQ agent worker + merge worker | none (background) |
| `web` | `node:22-alpine` | Next.js standalone server | 3009 |
| `postgres` | `postgres:16-alpine` | Database | 5433 |
| `redis` | `redis:7-alpine` | Queue + pub/sub | 6380 |
| `nginx` | `nginx:alpine` | Reverse proxy + SSL termination | 80, 443 |

**Multi-stage Dockerfile pattern for monorepo:**

```
Stage 1 (base):     node:22-alpine, install pnpm
Stage 2 (prune):    turbo prune --scope=@techteam/api --docker
Stage 3 (install):  Copy pruned package.json files, pnpm install --frozen-lockfile
Stage 4 (build):    Copy source files, turbo build --filter=@techteam/api
Stage 5 (runner):   Copy only built artifacts, minimal runtime
```

This pattern uses `turbo prune` to create a minimal subset of the monorepo for each service, dramatically reducing image size.

**For Next.js (web):**
- Use `output: 'standalone'` in `next.config.js` to produce a self-contained server
- The standalone output includes only necessary dependencies, reducing image from ~1GB to ~100-200MB
- Copy `.next/standalone`, `.next/static`, and `public` to the runner stage

**Production considerations:**

| Concern | Solution |
|---------|----------|
| **Secrets** | `.env` file mounted via docker-compose `env_file`, NOT baked into image |
| **SSL** | Let's Encrypt via Certbot + nginx, or Caddy as reverse proxy (auto-SSL) |
| **Health checks** | Each service has `/health` endpoint; docker-compose healthcheck config |
| **Restart policy** | `restart: unless-stopped` for all services |
| **Volumes** | Postgres data, Redis data, git repos (agent needs filesystem access) |
| **Git repos** | Agent worker needs access to cloned repos; mount a volume for `/repos` |
| **Logging** | JSON logging to stdout; collect via docker logs or log aggregator |
| **Updates** | `docker compose pull && docker compose up -d` for rolling updates |

**Critical: Agent worker filesystem access.** The agent worker clones Git repos and runs Claude Code SDK which executes file operations. The worker container needs:
- A persistent volume mounted for repo storage
- Git installed in the container
- The Claude Code CLI installed (for SDK subprocess)
- Network access to GitHub and Anthropic API

### Complexity: HIGH

- Dockerfiles for api, web, worker (3 separate multi-stage files or shared base)
- `turbo prune` integration for optimized builds
- Next.js standalone output configuration
- Production docker-compose with all services, networking, volumes
- nginx configuration for reverse proxy + SSL
- Worker container with Git + Claude Code SDK dependencies
- Environment variable management (.env, secrets)
- Health checks and restart policies
- CI/CD pipeline for building and pushing images (optional, manual deploy first)

**Confidence:** HIGH for standard containerization patterns. MEDIUM for the agent worker container (Claude Code SDK requires specific runtime dependencies that may need investigation).

### Dependencies on Existing

| Existing Feature | Relationship |
|------------------|-------------|
| `docker-compose.yml` | **Extend** -- add api, web, worker, nginx services to existing postgres/redis |
| `turbo.json` | **Reuse** -- turbo prune uses existing workspace config |
| `package.json` (root) | **Reuse** -- pnpm workspace config |
| Agent worker (`agent.worker.ts`) | **Adapt** -- ensure repoPath references work inside container |
| `config.ts` | **Adapt** -- env vars loaded from Docker env, not local .env file |
| `next.config.ts` | **Modify** -- add `output: 'standalone'` |

---

## Feature Classification Summary

### Table Stakes (Users Expect These)

Features that feel broken or missing without them.

| Feature | Why Expected | Complexity | Phase |
|---------|--------------|------------|-------|
| **Sidebar navigation** | Current top-nav is flat; project management tools universally use sidebars; multi-project navigation requires hierarchy | MEDIUM | Early |
| **Clickable demand cards** | Users instinctively click cards to open them; the tiny icon link is a usability anti-pattern | LOW | Early |
| **WebSocket real-time** | 5s polling lag feels broken when watching an agent execute; users expect instant feedback in 2026 | MEDIUM-HIGH | Mid |
| **Docker production deploy** | Cannot ship a SaaS product running on `npm run dev` on a VPS; containerization is table stakes for production | HIGH | Late |

### Differentiators

Features that distinguish TechTeam from competitors and add unique value.

| Feature | Value Proposition | Complexity | Phase |
|---------|-------------------|------------|-------|
| **Claude MAX integration** | Cost reduction for heavy users; unlocks flat-rate AI execution vs per-token metering; no competitor offers this toggle | MEDIUM-HIGH | Mid |
| **Telegram bot notifications** | Meets users where they are (mobile/Telegram); pipeline status without opening the dashboard; especially valuable for Brazilian market where Telegram is popular | MEDIUM | Mid-Late |

### Anti-Features (Do NOT Build for v1.1)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Socket.IO instead of raw WebSocket** | Adds 80KB+ client bundle, unnecessary abstraction over ws, Fastify has native WS plugin | Use `@fastify/websocket` (raw ws) with a thin message protocol |
| **Full Telegram bot with commands** | Scope creep; users don't need to interact WITH the bot, just receive alerts | One-way notification bot only; no command interface beyond `/start` for linking |
| **WhatsApp Business API** | Expensive ($0.05+/message), complex approval process, Meta business verification | Start with Telegram only; add WhatsApp in v2 if demand exists |
| **SSE (Server-Sent Events) instead of WebSocket** | One-directional only; WebSocket needed for client subscribe/unsubscribe messages and future bidirectional features (live agent terminal) | Use WebSocket; SSE is simpler but limits future expansion |
| **Kubernetes deploy** | Massive overkill for a single-VPS SaaS product; operational complexity without benefit at this scale | Docker Compose; migrate to K8s only when scaling beyond single VPS |
| **Auto-deploy CI/CD pipeline** | Nice but not MVP for v1.1; manual `docker compose up` is sufficient initially | Document manual deploy process; add GitHub Actions CD in v1.2 |

---

## Feature Dependencies (v1.1 Internal)

```
Sidebar Navigation (standalone -- no dependencies on other v1.1 features)
    enables: better multi-project UX

Clickable Demand Cards (standalone -- no dependencies on other v1.1 features)
    enables: faster demand inspection workflow

WebSocket Real-Time
    requires: Docker deploy (for production WebSocket behind nginx)
    enhances: Notification system (instant push)
    enhances: Kanban board (instant updates)

Claude MAX Integration (standalone -- independent of other v1.1 features)
    modifies: agent execution auth flow

Telegram Bot Notifications
    benefits-from: WebSocket (can piggyback on same event emission)
    requires: Docker deploy (webhook needs public HTTPS endpoint)

Docker Production Deploy
    requires: all other features complete (deploy what's done)
    enables: WebSocket in production (nginx reverse proxy)
    enables: Telegram webhook (public HTTPS endpoint)
```

### Dependency Graph (Build Order)

```
Phase 1 (No Dependencies):
    [Sidebar Navigation] [Clickable Cards] [Claude MAX Integration]
         |                      |                    |
         v                      v                    v
    Immediate UX wins     Immediate UX win    Settings page extension

Phase 2 (Build on Existing):
    [WebSocket Real-Time]
         |
         v
    Backend + frontend infra for real-time events

Phase 3 (Needs HTTPS/Public URL):
    [Telegram Bot Notifications]
         |
         v
    Bot setup, linking flow, notification emission

Phase 4 (Packages Everything):
    [Docker Production Deploy]
         |
         v
    Dockerfiles, compose, nginx, SSL, deploy
```

---

## MVP Recommendation for v1.1

### Must Ship (Core of this milestone)

1. **Sidebar navigation** -- Biggest visual change; transforms the app from "prototype" to "product"
2. **Clickable demand cards** -- Trivial fix, massive UX improvement; do alongside sidebar
3. **WebSocket real-time** -- Core infrastructure upgrade; replaces polling across all features
4. **Docker production deploy** -- Cannot go to production without this

### Should Ship (High value, reasonable scope)

5. **Telegram bot notifications** -- Strong differentiator for the Brazilian market; medium complexity
6. **Claude MAX integration** -- Cost differentiator; important for heavy-usage tenants

### Defer if Needed

- Claude MAX integration has the highest risk (Anthropic policy uncertainty, per-tenant env var isolation complexity). If it blocks, ship the rest and add MAX support in v1.2.
- Telegram can be deferred to v1.2 if timeline is tight; in-app notifications already work.

---

## Sources

- [Claude Code headless mode documentation](https://code.claude.com/docs/en/headless) -- HIGH confidence
- [Using Claude Code with Pro/Max plan](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan) -- HIGH confidence
- [Claude Agent SDK OAuth demo](https://github.com/weidwonder/claude_agent_sdk_oauth_demo) -- MEDIUM confidence (community, not official)
- [SDK vs CLI auth issue #5891](https://github.com/anthropics/claude-code/issues/5891) -- HIGH confidence (official repo)
- [SDK OAuth token issue #6536](https://github.com/anthropics/claude-code/issues/6536) -- HIGH confidence (official repo)
- [Anthropic third-party OAuth policy (Jan 2026)](https://jpcaparas.medium.com/claude-code-cripples-third-party-coding-agents-from-using-oauth-6548e9b49df3) -- MEDIUM confidence
- [@fastify/websocket npm](https://www.npmjs.com/package/@fastify/websocket) -- HIGH confidence
- [Fastify WebSocket guide (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/fastify-websockets/) -- HIGH confidence
- [Fastify WebSocket broadcast patterns (GitHub issue #42)](https://github.com/fastify/fastify-websocket/issues/42) -- HIGH confidence
- [grammY framework](https://grammy.dev/) -- HIGH confidence (official docs)
- [grammY comparison with Telegraf](https://grammy.dev/resources/comparison) -- HIGH confidence
- [grammY deployment types (webhook vs polling)](https://grammy.dev/guide/deployment-types) -- HIGH confidence
- [shadcn/ui Sidebar component](https://ui.shadcn.com/docs/components/radix/sidebar) -- HIGH confidence
- [shadcn/ui Sidebar blocks](https://ui.shadcn.com/blocks/sidebar) -- HIGH confidence
- [Turborepo Docker guide](https://turborepo.dev/docs/guides/tools/docker) -- HIGH confidence
- [pnpm Docker guide](https://pnpm.io/docker) -- HIGH confidence
- [Next.js standalone output](https://nextjs.org/docs/app/getting-started/deploying) -- HIGH confidence
- [Next.js Docker production patterns (2025)](https://github.com/kristiyan-velkov/nextjs-prod-dockerfile) -- MEDIUM confidence

---

*Feature research for: TechTeam Platform v1.1 -- UX Improvements and Production Readiness*
*Researched: 2026-02-13*
*Overall Confidence: HIGH (all features use well-established patterns with official documentation)*
