# Domain Pitfalls

**Domain:** AI Agent Orchestration Platform (v1.1 Feature Additions)
**Researched:** 2026-02-13
**Confidence:** MEDIUM-HIGH

> **Research Context:** Pitfalls specific to adding WebSocket, Claude MAX CLI, Telegram bot, Docker containerization, sidebar navigation, and clickable-card enhancements to an existing Fastify 5 / Next.js 15 / BullMQ / multi-tenant platform. Verified against current codebase, official docs, and community issues.

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or major regressions in the existing system.

---

### Pitfall 1: WebSocket + Polling Dual-Update Race Condition

**What goes wrong:** After adding WebSocket push, the existing TanStack Query 5-second `refetchInterval` (kanban-board.tsx line 55) still fires. A polling response arrives *after* a WebSocket `setQueryData` update, overwriting it with stale server data. The UI flickers: card jumps to new column, snaps back, jumps again.

**Why it happens:**
- The existing kanban board uses `refetchInterval: 5000` and `refetchIntervalInBackground: false`
- WebSocket messages call `queryClient.setQueryData` to push fresh state
- A polling fetch that started *before* the WebSocket message arrives *after* it, replacing the cache with older data
- TanStack Query's `updatedAt` timestamp does not distinguish between "data from server fetch" and "data from WebSocket push" -- both are treated as equally authoritative

**Consequences:**
- **UI flicker:** Cards visibly jump between columns on the kanban board
- **Optimistic update rollback:** Drag-and-drop optimistic updates (kanban-board.tsx lines 67-93) get clobbered by stale polling data
- **User confusion:** Demand appears in wrong stage for 5 seconds until next poll corrects it
- **Data integrity risk:** If a mutation fires during the race window, it may operate on stale data

**Prevention:**
1. **Disable polling when WebSocket is connected:**
   ```typescript
   const { isConnected } = useWebSocket()

   const { data } = useQuery({
     queryKey: ["demands", projectId],
     queryFn: () => api.get<DemandsResponse>(`/api/demands?projectId=${projectId}`),
     // Only poll when WebSocket is disconnected (fallback mode)
     refetchInterval: isConnected ? false : 5000,
     refetchIntervalInBackground: false,
   })
   ```
2. **Use `queryClient.invalidateQueries` instead of `setQueryData` for WebSocket events:**
   This triggers a fresh fetch that goes through TanStack Query's normal deduplication. Only use `setQueryData` for high-frequency updates (typing indicators, cursor positions) where latency matters.
3. **Version-stamp updates:** Include a monotonic version number in both WebSocket messages and API responses. Only apply updates with a higher version than what is currently in cache.
4. **Cancel in-flight queries on WebSocket message:**
   ```typescript
   ws.onmessage = (event) => {
     const msg = JSON.parse(event.data)
     if (msg.type === "demands_updated") {
       queryClient.cancelQueries({ queryKey: ["demands", projectId] })
       queryClient.invalidateQueries({ queryKey: ["demands", projectId] })
     }
   }
   ```

**Detection:**
- Console log when WebSocket update is immediately overwritten by polling
- Monitor `queryClient` cache timestamps -- if `updatedAt` goes backward, a stale overwrite occurred
- User reports of "flickering cards" or "demand jumps back to old column"

**Confidence:** HIGH -- this is a well-documented pattern in TanStack Query WebSocket integration. The exact race is described in [TanStack Query Discussion #7180](https://github.com/TanStack/query/discussions/7180).

---

### Pitfall 2: WebSocket Authentication Bypass in Multi-Tenant Context

**What goes wrong:** WebSocket connections bypass the existing Fastify auth + tenant plugin chain. A user connects to the WebSocket endpoint without proper session validation, or connects with Tenant A's session but receives Tenant B's real-time updates.

**Why it happens:**
- The current auth flow (server.ts lines 36-46) uses `authPlugin` and `tenantPlugin` as Fastify preHandler hooks
- WebSocket upgrade requests in `@fastify/websocket` receive the initial HTTP request but the connection then "escapes" the normal request lifecycle
- The `request.prisma` decoration (tenant.ts line 13) is set in a preHandler hook -- WebSocket handlers may not have this decoration available, or it gets set once at connection time and never updated if the user switches organizations
- Session cookies are sent only on the initial HTTP upgrade request, not on subsequent WebSocket frames

**Consequences:**
- **Tenant data leakage:** Most critical -- user sees real-time updates for demands/projects in other tenants
- **Unauthorized access:** Expired sessions still receive WebSocket updates until connection drops
- **Security audit failure:** WebSocket endpoint becomes the weakest link in tenant isolation

**Prevention:**
1. **Authenticate during WebSocket upgrade, not after:**
   ```typescript
   fastify.register(async (app) => {
     app.register(authPlugin)
     app.register(tenantPlugin)

     app.get("/ws", { websocket: true }, (socket, request) => {
       // request.prisma is already tenant-scoped from preHandler
       const tenantId = request.session.session.activeOrganizationId
       if (!tenantId) {
         socket.close(4001, "No tenant context")
         return
       }
       // Subscribe this socket ONLY to this tenant's channel
       subscribeToTenant(socket, tenantId)
     })
   })
   ```
2. **Periodic session re-validation:** Every 60 seconds, re-validate the session cookie that was sent during upgrade. If session expired or org changed, close the WebSocket.
3. **Tenant-scoped Redis pub/sub channels:** Use `tenant:{tenantId}:updates` as the Redis channel name. Never broadcast to a global channel.
4. **Attach `on('message')` handlers synchronously:** Per @fastify/websocket docs, attach event handlers *before* any async operations to avoid dropping messages during auth checks.

**Detection:**
- Integration test: Connect WebSocket with Tenant A session, publish update for Tenant B, verify Tenant A does NOT receive it
- Audit log: Track `tenantId` on every WebSocket message sent/received
- Monitor for WebSocket connections without corresponding authenticated sessions

**Confidence:** HIGH -- the tenant plugin pattern is visible in the codebase (tenant.ts), and the gap between HTTP preHandler and WebSocket handler lifecycle is a documented @fastify/websocket pattern.

---

### Pitfall 3: Claude CLI Spawn Failures in Production (ENOENT/EBADF)

**What goes wrong:** The system currently uses `@anthropic-ai/claude-agent-sdk` (base-agent.ts) with the `query()` function. Adding Claude CLI as an alternative execution path introduces child process spawning, which fails with `spawn ENOENT` or `EBADF` errors, especially in Docker containers.

**Why it happens:**
- Claude Code CLI binary path differs between development (global npm install) and Docker containers
- [GitHub Issue #771](https://github.com/anthropics/claude-code/issues/771): Claude Code cannot be reliably spawned from Node.js child_process
- [GitHub Issue #4383](https://github.com/anthropics/claude-code/issues/4383): SDK's internal spawn fails with ENOENT in Docker despite correct `pathToClaudeCodeExecutable`
- [GitHub Issue #7326](https://github.com/anthropics/claude-code/issues/7326): EBADF (bad file descriptor) errors in Node.js child process
- The Claude MAX subscription model means no API key is needed for CLI, but the CLI requires a different authentication flow (OAuth-based login vs API key)

**Consequences:**
- **Silent execution failure:** Agent job enqueued, CLI spawn fails, demand stuck in "running" forever
- **Docker deployment blocker:** Works locally, fails in container -- classic "it works on my machine"
- **Dual-path complexity:** Maintaining two execution paths (SDK + CLI) doubles the surface area for bugs
- **Authentication confusion:** SDK uses `ANTHROPIC_API_KEY`, CLI uses subscription login -- mixing them up causes cryptic errors

**Prevention:**
1. **Use SDK as primary, CLI as experimental fallback only:**
   ```typescript
   async function executeAgentWithFallback(params: AgentExecutionParams) {
     try {
       return await executeAgent(params) // Existing SDK path
     } catch (sdkError) {
       if (config.CLAUDE_CLI_ENABLED && isRetryableError(sdkError)) {
         return await executeAgentViaCLI(params) // CLI fallback
       }
       throw sdkError
     }
   }
   ```
2. **Never assume CLI binary location:** Use `which claude` or `command -v claude` to find the binary at runtime. Store the resolved path.
3. **Health check on startup:**
   ```typescript
   async function validateCLIAvailable(): Promise<boolean> {
     try {
       const { stdout } = await execAsync("claude --version", { timeout: 5000 })
       return stdout.includes("claude")
     } catch {
       return false
     }
   }
   ```
4. **Use `--output-format json` for machine-readable output:** Never parse human-readable text output. The CLI's `--output-format json` returns structured JSON with `result`, `session_id`, and metadata fields. Use `--json-schema` for typed structured output.
5. **Set explicit timeouts on child process:** The CLI has no built-in timeout. Wrap with `AbortController` or `child_process` timeout option.
6. **For Docker:** Install Claude CLI in the Dockerfile explicitly, verify with a RUN test step, and use `pathToClaudeCodeExecutable` if using the SDK's spawn internally.

**Detection:**
- Health check endpoint reports CLI availability status
- Agent worker logs spawn errors with full error code (ENOENT, EBADF, EPERM)
- Metric: CLI success rate vs SDK success rate -- if CLI < 90%, disable it

**Confidence:** HIGH -- multiple open GitHub issues confirm these are active, unresolved problems as of late 2025.

---

### Pitfall 4: Docker Build Breaks with turbo prune + pnpm Lockfile Corruption

**What goes wrong:** Running `turbo prune --docker` for the API or web app produces a corrupted `pnpm-lock.yaml` in the `out/` directory. `pnpm install --frozen-lockfile` then fails inside the Docker build with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` or missing dependency errors.

**Why it happens:**
- [turborepo Issue #3382](https://github.com/vercel/turborepo/issues/3382): `turbo prune` produces broken pnpm lockfiles when dependencies use `npm:` aliases
- [turborepo Issue #10584](https://github.com/vercel/turborepo/issues/10584): `turbo prune --docker` strips `injectWorkspacePackages` from `pnpm-lock.yaml` settings
- The TechTeam monorepo uses internal workspace packages (`@techteam/database`, `@techteam/shared`) which get incorrectly pruned
- pnpm's lockfile format includes workspace-specific metadata that turbo prune does not fully understand

**Consequences:**
- **Build failure:** Docker image cannot be built at all -- complete deployment blocker
- **CI/CD pipeline breakage:** Every push triggers failed builds
- **Workaround instability:** Hacks like `sed` patching the lockfile are fragile and break on lockfile format changes
- **Developer frustration:** "Docker build worked yesterday, fails today" after any dependency change

**Prevention:**
1. **Test turbo prune output before Dockerizing:**
   ```bash
   # Run this in CI before Docker build
   turbo prune api --docker
   cd out && pnpm install --frozen-lockfile
   # If this fails, the Docker build will too
   ```
2. **Use pnpm's native Docker strategy instead of turbo prune:**
   ```dockerfile
   FROM node:20-alpine AS base
   RUN corepack enable && corepack prepare pnpm@latest --activate

   # Stage 1: Install dependencies using pnpm fetch (lockfile-only install)
   FROM base AS deps
   WORKDIR /app
   COPY pnpm-lock.yaml pnpm-workspace.yaml ./
   COPY packages/database/package.json ./packages/database/
   COPY packages/shared/package.json ./packages/shared/
   COPY apps/api/package.json ./apps/api/
   RUN pnpm fetch
   COPY . .
   RUN pnpm install --offline --frozen-lockfile

   # Stage 2: Build
   FROM deps AS builder
   RUN pnpm turbo build --filter=api

   # Stage 3: Production
   FROM base AS runner
   WORKDIR /app
   COPY --from=builder /app/apps/api/dist ./dist
   COPY --from=builder /app/node_modules ./node_modules
   CMD ["node", "dist/server.js"]
   ```
3. **Pin turbo and pnpm versions** in `package.json` `packageManager` field and `devDependencies`. Lockfile format changes between versions.
4. **If using turbo prune, apply the sed workaround for injectWorkspacePackages:**
   ```dockerfile
   RUN turbo prune api --docker
   # Workaround for turborepo Issue #10584
   RUN sed -i '/^settings:/a \ injectWorkspacePackages: true' ./out/pnpm-lock.yaml
   ```

**Detection:**
- CI pipeline that runs `turbo prune` + `pnpm install --frozen-lockfile` as a separate job before Docker build
- Docker build fails with lockfile-related errors -- check turbo and pnpm version compatibility
- Dependency changes that don't touch the app code but break Docker builds

**Confidence:** HIGH -- verified via multiple open GitHub issues with reproduction steps. The turbo prune + pnpm combination is known to be fragile.

---

### Pitfall 5: NEXT_PUBLIC_ Environment Variables Baked into Docker Image

**What goes wrong:** `NEXT_PUBLIC_API_URL` (currently hardcoded to `http://localhost:3010` in api.ts line 1) gets inlined into the JavaScript bundle at `next build` time. The Docker image built for staging has `http://staging-api:3010` baked in; deploying the same image to production still points to staging.

**Why it happens:**
- Next.js inlines all `NEXT_PUBLIC_*` values into the client bundle during `next build` -- they are NOT read from environment at runtime
- This is fundamental to how Next.js works: client-side code cannot read `process.env` at runtime
- The current codebase reads `process.env.NEXT_PUBLIC_API_URL` in `api.ts`, which works in development (next dev reads .env) but will be frozen at build time in Docker
- Building separate Docker images per environment defeats the purpose of containerization

**Consequences:**
- **Wrong API endpoint:** Production frontend calls staging API (or vice versa)
- **Silent failure:** No error thrown -- the frontend just talks to the wrong backend
- **Per-environment builds:** Need separate Docker images for dev/staging/prod, eliminating the "build once, deploy anywhere" benefit
- **Security risk:** Internal staging URLs exposed in production JavaScript bundles

**Prevention:**
1. **Replace NEXT_PUBLIC_ with server-side API route proxy:**
   ```typescript
   // apps/web/src/app/api/[...proxy]/route.ts
   export async function GET(request: NextRequest) {
     const apiUrl = process.env.API_URL // Server-side, read at runtime
     const path = request.nextUrl.pathname.replace("/api/", "/")
     return fetch(`${apiUrl}${path}`, { headers: request.headers })
   }
   ```
   Then `api.ts` always calls `/api/...` (same origin), and the server proxies to the real API URL read from runtime env.

2. **Use `next-runtime-env` package** for values that genuinely must be on the client:
   ```typescript
   // Layout injects env vars into <script> tag at request time
   import { PublicEnvScript } from "next-runtime-env"

   export default function RootLayout({ children }) {
     return (
       <html>
         <head><PublicEnvScript /></head>
         <body>{children}</body>
       </html>
     )
   }
   ```

3. **For the current codebase migration:** The existing `api.ts` defaults to `http://localhost:3010` -- this must NOT be a `NEXT_PUBLIC_` value in Docker. Use a server-side proxy pattern or ensure all API calls go through Next.js API routes.

**Detection:**
- In Docker build output, search for your API URL in the `.next/static` bundle
- Test: Build image with `NEXT_PUBLIC_API_URL=http://test`, deploy, check what URL the browser actually calls
- Automated check in CI: Grep built JavaScript for environment-specific URLs

**Confidence:** HIGH -- this is one of the most well-documented Next.js Docker pitfalls, with thousands of GitHub discussions dating back years. See [vercel/next.js Discussion #17641](https://github.com/vercel/next.js/discussions/17641).

---

## Moderate Pitfalls

---

### Pitfall 6: Telegram Bot Tenant Linking Without Verification

**What goes wrong:** A user types `/link myemail@company.com` in Telegram. The bot links their Telegram `chat_id` to that email's account without verifying they actually own it. Attacker links to victim's account, receives all their notifications.

**Why it happens:**
- Telegram provides `chat_id` (unique per user-bot pair) but no email or identity verification
- Naive implementation: user provides email, bot looks up user, links `chat_id` to that user
- No confirmation step or token-based verification
- Multi-tenant complication: user may belong to multiple tenants, which one gets notifications?

**Consequences:**
- **Notification leakage:** Attacker receives all real-time notifications for victim's demands
- **Privacy violation:** Agent failure messages, demand titles, project names leaked
- **Compliance failure:** GDPR violation -- personal data sent to unauthorized party
- **Trust destruction:** If discovered, users will not trust the notification system

**Prevention:**
1. **Token-based linking flow:**
   ```
   User in web UI: clicks "Link Telegram" -> generates one-time code (e.g., "ABC-123")
   User in Telegram: /link ABC-123
   Bot: verifies code against database, links chat_id to authenticated user
   Code expires after 5 minutes
   ```
2. **Never allow email-based linking.** The Telegram `chat_id` must only be linked via a verified session in the web app.
3. **Per-tenant linking:** Store `(userId, tenantId, chatId)` tuple. User can link different Telegram accounts to different tenants, or same account to multiple tenants with explicit channel selection.
4. **Unlink confirmation:** `/unlink` command should require re-verification, not just trust the chat_id.

**Detection:**
- Audit log: Track all link/unlink events with timestamps and IP/chat_id
- Alert: Multiple users linked to same chat_id (sharing a bot group)
- Alert: User linked who never generated a linking code in the web UI

**Confidence:** HIGH -- standard security pattern for cross-platform identity linking.

---

### Pitfall 7: Telegram Rate Limits Causing Silent Notification Loss

**What goes wrong:** An agent pipeline completes 10 demands across 3 tenants simultaneously. The system tries to send 30+ Telegram messages in quick succession. Telegram returns 429 Too Many Requests. Messages are silently dropped.

**Why it happens:**
- Telegram rate limits: max ~30 messages/second globally per bot, max ~1 message/second per chat
- The existing notification system (agent.worker.ts lines 261-279) fires notifications synchronously during job completion
- If Telegram sending is added inline with the existing notification creation, rate limits will be hit during burst scenarios
- Rate limits are per-bot-token, not per-server -- scaling horizontally does not help

**Consequences:**
- **Silent message loss:** User never receives critical "agent failed" notification
- **Inconsistent experience:** In-app notification shows, Telegram does not
- **429 cascading:** If the system keeps retrying immediately, Telegram may temporarily ban the bot
- **User loses trust:** "Telegram notifications are unreliable, I'll just ignore them"

**Prevention:**
1. **Queue Telegram messages through BullMQ** (not inline):
   ```typescript
   // In agent.worker.ts, AFTER creating the in-app notification:
   await telegramQueue.add("send-notification", {
     chatId: user.telegramChatId,
     message: `Agent failed: ${phase} for "${demand.title}"`,
   }, {
     attempts: 3,
     backoff: { type: "exponential", delay: 1000 },
   })
   ```
2. **Rate limiter on the Telegram worker:**
   ```typescript
   const telegramWorker = new Worker("telegram-notifications", handler, {
     connection: createWorkerConnection(),
     concurrency: 1, // Process one at a time
     limiter: {
       max: 25, // 25 messages per second (under Telegram's 30 limit)
       duration: 1000,
     },
   })
   ```
3. **Batch notifications:** If multiple events happen within 5 seconds for the same user, combine into a single message: "3 demands completed, 1 failed."
4. **In-app notification is primary, Telegram is supplementary.** Never block the agent pipeline waiting for Telegram delivery.

**Detection:**
- Track Telegram delivery success rate per hour
- Alert if 429 responses exceed 5% of sends
- Compare in-app notification count vs Telegram delivery count -- discrepancy = problem

**Confidence:** HIGH -- Telegram rate limits are well-documented at [core.telegram.org/bots/faq](https://core.telegram.org/bots/faq).

---

### Pitfall 8: Telegram Webhook Requires Public HTTPS URL

**What goes wrong:** The system currently runs locally with `docker-compose.yml` exposing ports on localhost only. Telegram webhooks require a publicly accessible HTTPS URL. Development and testing of the Telegram bot becomes impossible without additional infrastructure.

**Why it happens:**
- Telegram's webhook mode sends HTTP POST to your server -- it must be reachable from Telegram's servers
- The current docker-compose exposes `5433:5432` (Postgres) and `6380:6379` (Redis) on localhost only
- No reverse proxy, no SSL termination, no public URL in the current setup
- Long polling alternative works locally but has different failure modes in production

**Consequences:**
- **Development friction:** Cannot test Telegram bot without ngrok/cloudflare tunnel
- **Webhook vs polling confusion:** Team uses polling in dev, webhook in prod -- different code paths, different bugs
- **SSL certificate management:** Additional operational complexity
- **Webhook registration fails silently:** If URL becomes unreachable, Telegram stops sending updates with no notification to your system

**Prevention:**
1. **Use long polling for development, webhook for production:**
   ```typescript
   if (config.NODE_ENV === "production") {
     await bot.api.setWebhook(`${config.PUBLIC_URL}/telegram/webhook`)
     // Fastify route handles incoming updates
   } else {
     bot.start() // Long polling, works on localhost
   }
   ```
2. **For development with webhooks:** Use `ngrok` or `cloudflare tunnel` with a documented setup script:
   ```bash
   # dev-telegram.sh
   ngrok http 3010 --domain=your-dev.ngrok-free.app
   ```
3. **Webhook health monitoring:** Periodically call `getWebhookInfo()` to verify webhook is active and check `last_error_date`/`last_error_message`.
4. **Graceful degradation:** If webhook fails, fall back to polling with a warning log.

**Detection:**
- `bot.api.getWebhookInfo()` returns `last_error_date` within last 5 minutes
- Zero incoming Telegram updates for > 10 minutes (if users are active)
- Health check endpoint includes Telegram webhook status

**Confidence:** MEDIUM-HIGH -- standard Telegram bot infrastructure concern.

---

### Pitfall 9: Sidebar Retrofit Causes Layout Flash on Navigation

**What goes wrong:** The current dashboard layout (layout.tsx) uses a simple top header with inline navigation links (lines 60-108). Retrofitting a sidebar causes a visible layout shift: the main content area shrinks horizontally on every navigation, or the sidebar appears after the page content loads, causing a "flash of unstyled content."

**Why it happens:**
- The current layout is a `"use client"` component that checks session state before rendering
- During the `isPending` state (lines 41-47), a centered loading spinner is shown -- no sidebar
- After auth resolves, the sidebar appears, shifting all content to the right
- Next.js App Router preserves layout state across navigations, but the *initial load* still shows loading state without sidebar
- CSS `min-h-screen` on the current wrapper (line 59) does not account for a sidebar width

**Consequences:**
- **Cumulative Layout Shift (CLS):** Poor Core Web Vitals score
- **Visual jarring:** Content jumps right when sidebar appears
- **Mobile breakage:** If sidebar is always visible, mobile users lose most of their screen
- **State persistence confusion:** Sidebar open/closed state resets on hard navigation but persists on soft navigation

**Prevention:**
1. **Render sidebar skeleton during loading state:**
   ```tsx
   if (isPending) {
     return (
       <div className="flex min-h-screen">
         <aside className="w-64 border-r bg-muted/40 animate-pulse" />
         <main className="flex-1 p-6">
           <div className="text-muted-foreground">Loading...</div>
         </main>
       </div>
     )
   }
   ```
2. **CSS-first approach:** Use CSS Grid or Flexbox with fixed sidebar width so the layout structure exists before JavaScript hydrates:
   ```css
   .dashboard-layout {
     display: grid;
     grid-template-columns: 16rem 1fr; /* Sidebar always 256px */
     min-height: 100vh;
   }
   @media (max-width: 768px) {
     .dashboard-layout {
       grid-template-columns: 1fr; /* No sidebar on mobile */
     }
   }
   ```
3. **Store sidebar state in cookie, not React state:** Cookies are available server-side, so the sidebar can render with correct open/closed state on first paint. localStorage causes flash because it is only available after hydration.
4. **Responsive: sidebar becomes sheet on mobile:**
   ```tsx
   // Desktop: persistent sidebar
   // Mobile: hamburger menu + Sheet (already have Sheet component)
   <Sheet>
     <SheetTrigger className="md:hidden">
       <Menu />
     </SheetTrigger>
     <SheetContent side="left">
       <SidebarNav />
     </SheetContent>
   </Sheet>
   ```

**Detection:**
- Lighthouse CLS score before and after sidebar addition
- Visual regression test: Screenshot comparison on page load
- Test on slow 3G: Does the sidebar appear after content?

**Confidence:** HIGH -- layout shift during auth-gated rendering is a common Next.js pattern. The existing code's `isPending` state makes this predictable.

---

### Pitfall 10: Click Events Swallowed by Drag Handler on Demand Cards

**What goes wrong:** Demand cards become clickable (navigating to detail page) but the existing dnd-kit drag handler intercepts the click. Users try to click a card to view details, but the card starts dragging instead. Or worse, a micro-drag (3px movement during click) triggers both a drag and a navigation.

**Why it happens:**
- The current kanban uses `KanbanItem` with `asHandle` prop (kanban-board.tsx line 162), meaning the entire card is the drag handle
- The existing `PointerSensor` has `activationConstraint: { distance: 5 }` (kanban.tsx line 76) -- only 5 pixels to distinguish click from drag
- The DemandCard has a small link icon (demand-card.tsx lines 32-39) that uses `e.stopPropagation()` and `onPointerDown` stop -- but making the *entire card* clickable conflicts with the drag handle
- dnd-kit's PointerSensor captures pointer events globally once activated, preventing click events from firing ([dnd-kit Issue #591](https://github.com/clauderic/dnd-kit/issues/591), [Issue #800](https://github.com/clauderic/dnd-kit/issues/800))

**Consequences:**
- **Broken navigation:** Users cannot click cards to view demand details
- **Accidental drags:** Cards move to wrong columns on intended clicks
- **Touch device amplification:** On mobile, finger imprecision makes 5px threshold even worse
- **Accessibility regression:** Keyboard users cannot both navigate to card detail AND reorder via keyboard

**Prevention:**
1. **Use delay-based activation instead of distance:**
   ```typescript
   const sensors = useSensors(
     useSensor(PointerSensor, {
       activationConstraint: {
         delay: 150, // Must hold 150ms to start drag
         tolerance: 5, // Allow 5px movement during delay
       },
     }),
     useSensor(KeyboardSensor)
   )
   ```
   This means: tap/click fires instantly. Press-and-hold for 150ms initiates drag. This is the recommended approach from [dnd-kit Discussion #476](https://github.com/clauderic/dnd-kit/discussions/476).

2. **Separate drag handle from clickable area:**
   ```tsx
   <KanbanItem value={demand.id} asHandle={false}>
     <div className="rounded-lg border bg-card p-3 shadow-sm">
       {/* Drag handle: small grip icon */}
       <KanbanItemHandle className="cursor-grab">
         <GripVertical className="size-4 text-muted-foreground" />
       </KanbanItemHandle>
       {/* Rest of card is clickable */}
       <Link href={`/demands/${demand.id}`}>
         <p className="text-sm font-medium">{demand.title}</p>
       </Link>
     </div>
   </KanbanItem>
   ```

3. **If entire card must be both draggable and clickable:** Track drag state and use `onDragEnd` to determine if it was a click:
   ```typescript
   const [wasDragged, setWasDragged] = useState(false)

   // In Kanban component:
   onDragStart={() => setWasDragged(true)}
   onDragEnd={() => setTimeout(() => setWasDragged(false), 0)}

   // In card onClick:
   onClick={() => {
     if (!wasDragged) router.push(`/demands/${demand.id}`)
   }}
   ```

**Detection:**
- Manual QA: Try to click every card on the board. Try on touch device.
- Track: ratio of demand-detail page views to card renders. If too low, clicks are being swallowed.
- User feedback: "I can't open demands from the board"

**Confidence:** HIGH -- the existing codebase uses `asHandle` on the entire card (line 162), making this a guaranteed conflict when adding full-card click navigation.

---

### Pitfall 11: WebSocket Connection Leak Under Reconnection

**What goes wrong:** Browser tab stays open for hours. WebSocket disconnects (network blip, server restart). Reconnection logic creates a new WebSocket without closing the old one. After several reconnections, the client has 5+ open connections, each receiving duplicate messages.

**Why it happens:**
- React's useEffect cleanup function must explicitly close the WebSocket
- If the WebSocket provider re-renders (e.g., session refresh, org switch), a new connection is created
- The existing `Providers` component (providers.tsx) wraps the entire app -- adding a WebSocket provider here means it re-mounts on any provider change
- `StrictMode` in development causes double-mounting, creating 2 connections immediately

**Consequences:**
- **Duplicate messages:** Every notification appears 2-5 times in the UI
- **Memory leak:** Each connection holds event listeners and message buffers
- **Server resource exhaustion:** Server maintains N connections per client instead of 1
- **Redis pub/sub fan-out:** Each connection subscribes to the same channels, multiplying Redis work

**Prevention:**
1. **Singleton WebSocket manager outside React lifecycle:**
   ```typescript
   // lib/websocket.ts -- NOT a React component
   class WebSocketManager {
     private ws: WebSocket | null = null
     private reconnectTimer: NodeJS.Timeout | null = null

     connect(url: string) {
       this.disconnect() // Always close existing first
       this.ws = new WebSocket(url)
       this.ws.onclose = () => this.scheduleReconnect(url)
     }

     disconnect() {
       if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
       if (this.ws) {
         this.ws.onclose = null // Prevent reconnect on intentional close
         this.ws.close()
         this.ws = null
       }
     }

     private scheduleReconnect(url: string) {
       this.reconnectTimer = setTimeout(() => this.connect(url), 3000)
     }
   }

   export const wsManager = new WebSocketManager() // Singleton
   ```
2. **useEffect cleanup must call disconnect:**
   ```typescript
   useEffect(() => {
     wsManager.connect(WS_URL)
     return () => wsManager.disconnect()
   }, []) // Empty deps -- connect once
   ```
3. **Exponential backoff on reconnection:** 1s, 2s, 4s, 8s, max 30s. Reset backoff on successful connection.
4. **Connection deduplication on server:** Track `userId + tenantId` per connection. If a new connection arrives for same user, close the old one.

**Detection:**
- Server metric: connections per unique user. Should be ~1, alert if > 2.
- Client-side: Log WebSocket open/close events. If opens > closes, there is a leak.
- Memory profiling: Growing heap in long-running browser sessions.

**Confidence:** HIGH -- WebSocket connection leaks are the single most common WebSocket implementation bug.

---

### Pitfall 12: Docker Compose Full Containerization Breaks Local Git Operations

**What goes wrong:** The agent worker runs `git clone`, `git checkout`, and `git push` on the host filesystem (git.ts, agent.worker.ts lines 370-476). When the API is containerized, it can no longer access the host's Git repos, SSH keys, or Git credentials.

**Why it happens:**
- The current system uses `project.repoPath` which points to a host filesystem path (e.g., `C:\Users\igor\projects\my-repo`)
- Inside a Docker container, this path does not exist
- Git operations require SSH keys or GitHub tokens for push/PR operations -- these are on the host, not in the container
- Git worktrees (agent.worker.ts lines 401-415) create sibling directories that need to persist across container restarts

**Consequences:**
- **Agent pipeline completely broken:** Development phase cannot run -- no git access
- **Volume mount complexity:** Mounting arbitrary host paths into containers requires privileged mode or complex volume configurations
- **Security risk:** Mounting host SSH keys into containers exposes them
- **Cross-platform issues:** Windows host paths don't work in Linux containers

**Prevention:**
1. **Phase the containerization:** Do NOT containerize the agent worker in v1.1. Keep the API (HTTP routes) and web app in Docker, but run the agent worker on the host where Git repos live.
   ```yaml
   # docker-compose.yml
   services:
     postgres: ... # Already containerized
     redis: ...    # Already containerized
     api:          # NEW: containerize HTTP server only
       build: ./apps/api
       ports: ["3010:3010"]
       environment:
         - REDIS_URL=redis://redis:6379
     web:          # NEW: containerize frontend
       build: ./apps/web
       ports: ["3009:3009"]
     # agent-worker: NOT containerized -- runs on host
   ```
2. **If full containerization is required:** Clone repos into container-managed volumes:
   ```yaml
   services:
     api:
       volumes:
         - repo-workspace:/workspace # Persistent volume for git repos
         - /home/user/.ssh:/root/.ssh:ro # Read-only SSH key mount
   ```
3. **Use GitHub API for Git operations instead of local Git:** Replace `simple-git` with GitHub REST API / GraphQL for creating branches, committing files, and creating PRs. This eliminates the need for local filesystem Git entirely, but requires rewriting the Git integration layer.
4. **Separate "control plane" from "worker plane":** API handles HTTP requests (containerized). Worker handles Git + agent execution (host or dedicated VM with repo access).

**Detection:**
- Agent worker logs: `ENOENT` on `project.repoPath` access
- Development phase jobs all fail with "not a git repository"
- Docker healthcheck that verifies Git operations work

**Confidence:** HIGH -- the codebase explicitly uses host filesystem paths for Git operations. This is a fundamental architecture constraint that must be addressed before containerizing the worker.

---

## Minor Pitfalls

---

### Pitfall 13: grammY vs Telegraf Choice Affects Maintenance Burden

**What goes wrong:** Team picks Telegraf for the Telegram bot (more GitHub stars, more tutorials). Later discovers Telegraf's TypeScript support is weaker, middleware patterns are different from the Fastify-style the team knows, and the maintainer has lower activity.

**Prevention:**
- **Use grammY** because: better TypeScript types, active maintenance, middleware pattern similar to Fastify's plugin system, built-in webhook support with `webhookCallback()`, and official comparison at [grammy.dev/resources/comparison](https://grammy.dev/resources/comparison).
- grammY was created by a core Telegraf contributor specifically to fix Telegraf's type safety and maintenance issues.

**Confidence:** MEDIUM -- based on framework comparison docs and community sentiment.

---

### Pitfall 14: WebSocket Server Adds Complexity to Fastify CORS Configuration

**What goes wrong:** The current CORS config (server.ts lines 19-23) allows `config.WEB_URL` origin with credentials. WebSocket upgrade requests have different CORS semantics -- the browser sends an `Origin` header on the upgrade request but WebSocket frames are not subject to CORS. Teams add duplicate CORS logic or accidentally open WebSocket to all origins.

**Prevention:**
- Validate `Origin` header in the WebSocket upgrade handler, not via `@fastify/cors`
- WebSocket connections from unauthorized origins should be rejected during the HTTP upgrade phase
- Test: Connect from a different origin (e.g., `http://evil.com`) and verify rejection

**Confidence:** MEDIUM -- well-known WebSocket security concern.

---

### Pitfall 15: Sidebar State Persistence Across Refresh vs Navigation

**What goes wrong:** User collapses sidebar. Navigates to another page -- sidebar stays collapsed (good, Next.js layout persists). Hard refresh -- sidebar resets to expanded (bad, state was in React state). User resizes browser -- sidebar does not adapt.

**Prevention:**
- Store sidebar `isCollapsed` in a cookie (not localStorage, not React state):
  ```typescript
  // Server-readable on first render
  const sidebarState = cookies().get("sidebar-collapsed")?.value === "true"
  ```
- Use `@media` queries for responsive breakpoints, not JavaScript resize listeners
- Default: expanded on desktop (>1024px), hidden on mobile (<768px), collapsible on tablet

**Confidence:** HIGH -- standard pattern for server-rendered sidebar state.

---

### Pitfall 16: Docker Volume Data Loss on `docker compose down -v`

**What goes wrong:** Developer runs `docker compose down -v` (the `-v` flag) thinking it just stops containers. It deletes all named volumes -- PostgreSQL data, Redis data, all development data gone.

**Prevention:**
- Add a comment in `docker-compose.yml` warning about `-v`:
  ```yaml
  # WARNING: 'docker compose down -v' deletes ALL data volumes!
  # Use 'docker compose down' (without -v) to stop without data loss.
  ```
- Use a `Makefile` or `justfile` with safe commands:
  ```makefile
  stop:
    docker compose down  # Safe: preserves volumes
  reset:
    @echo "This will DELETE all database data. Continue? [y/N]"
    @read confirm && [ "$$confirm" = "y" ] && docker compose down -v
  ```
- Backup script that exports PostgreSQL data before destructive operations

**Confidence:** HIGH -- this bites every Docker user at least once.

---

### Pitfall 17: Mixed Authentication Model (API Key + Subscription) Confusion

**What goes wrong:** The existing system uses `ANTHROPIC_API_KEY` for the Claude Agent SDK (base-agent.ts line 38). Adding Claude MAX CLI integration means some execution paths use the subscription (no API key needed, uses OAuth login). A misconfigured deployment has the API key set but the CLI configured for subscription, or vice versa. Agent jobs fail with authentication errors that differ between the two paths.

**Prevention:**
- **Clear configuration separation:**
  ```typescript
  export const config = {
    // SDK execution (existing)
    ANTHROPIC_API_KEY: optionalEnv("ANTHROPIC_API_KEY", ""),
    CLAUDE_MODEL: ...,
    // CLI execution (new)
    CLAUDE_CLI_ENABLED: optionalEnv("CLAUDE_CLI_ENABLED", "false") === "true",
    CLAUDE_CLI_AUTH_MODE: optionalEnv("CLAUDE_CLI_AUTH_MODE", "api-key"), // "api-key" | "subscription"
  }
  ```
- **Startup validation:** If CLI is enabled, verify authentication works before accepting jobs
- **Feature flag:** CLI execution behind a feature flag, disabled by default, enabled per-tenant

**Confidence:** MEDIUM -- based on [Anthropic's own documentation](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan) distinguishing API vs subscription billing.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| **WebSocket Integration** | Race condition with existing polling (Pitfall 1) | CRITICAL | Disable polling when WS connected; version-stamp updates |
| **WebSocket Integration** | Tenant isolation bypass (Pitfall 2) | CRITICAL | Auth on upgrade; tenant-scoped Redis channels |
| **WebSocket Integration** | Connection leak on reconnect (Pitfall 11) | MODERATE | Singleton manager; explicit cleanup; server-side dedup |
| **Claude MAX CLI** | Spawn ENOENT/EBADF in Docker (Pitfall 3) | CRITICAL | Use SDK as primary; CLI as opt-in fallback only |
| **Claude MAX CLI** | Auth model confusion (Pitfall 17) | MINOR | Clear config separation; startup validation |
| **Telegram Bot** | Tenant linking without verification (Pitfall 6) | CRITICAL | Token-based linking via web UI only |
| **Telegram Bot** | Rate limit silent message loss (Pitfall 7) | MODERATE | BullMQ queue for Telegram sends; rate limiter |
| **Telegram Bot** | Webhook needs public HTTPS (Pitfall 8) | MODERATE | Polling for dev, webhook for prod; ngrok for testing |
| **Docker Containerization** | turbo prune lockfile corruption (Pitfall 4) | CRITICAL | Use pnpm fetch strategy; test prune in CI |
| **Docker Containerization** | NEXT_PUBLIC_ baked at build time (Pitfall 5) | CRITICAL | Server-side proxy or next-runtime-env |
| **Docker Containerization** | Git operations break in container (Pitfall 12) | CRITICAL | Do NOT containerize agent worker in v1.1 |
| **Docker Containerization** | Volume data loss (Pitfall 16) | MINOR | Documentation; safe Makefile commands |
| **Sidebar Navigation** | Layout flash during auth check (Pitfall 9) | MODERATE | Sidebar skeleton in loading state; CSS-first layout |
| **Sidebar Navigation** | State persistence across refresh (Pitfall 15) | MINOR | Cookie-based state; media queries for responsive |
| **Clickable Cards + DnD** | Click swallowed by drag handler (Pitfall 10) | MODERATE | Delay-based activation (150ms); or separate drag handle |
| **Telegram Bot** | Framework choice (Pitfall 13) | MINOR | Use grammY over Telegraf for TypeScript quality |

---

## Implementation Order Recommendations Based on Pitfall Severity

1. **Sidebar + Clickable Cards first** (Pitfalls 9, 10, 15) -- lowest risk, no backend changes, immediate UX improvement. Pitfalls are well-understood CSS/UX patterns.

2. **WebSocket second** (Pitfalls 1, 2, 11, 14) -- high risk but high value. Must be done carefully to avoid breaking existing polling. Recommend: implement WebSocket layer, test thoroughly with polling still active, then disable polling.

3. **Telegram Bot third** (Pitfalls 6, 7, 8, 13) -- moderate risk, isolated from existing system. The linking security (Pitfall 6) is the only critical concern. Rate limiting and webhook setup are standard patterns.

4. **Docker containerization last** (Pitfalls 4, 5, 12, 16) -- highest risk. Git operations in containers (Pitfall 12) is an architectural constraint that may require partial containerization only. NEXT_PUBLIC_ issue (Pitfall 5) requires frontend architecture changes.

5. **Claude MAX CLI integration -- defer or minimal** (Pitfalls 3, 17) -- the spawn issues are actively buggy upstream. Unless there is a strong cost motivation (MAX subscription vs API billing), the existing SDK path works. Add as feature-flagged experimental only.

---

## Retained v1.0 Pitfalls Still Relevant to v1.1

The following pitfalls from the original research remain active and may be amplified by v1.1 changes:

| Original Pitfall | v1.1 Amplification |
|-----------------|-------------------|
| Tenant Data Leakage (v1.0 #1) | WebSocket adds a new tenant isolation surface (Pitfall 2) |
| BullMQ Job Loss (v1.0 #2) | Telegram notification queue adds another queue to monitor |
| TanStack Query Staleness (v1.0 #7) | WebSocket integration fundamentally changes cache update strategy (Pitfall 1) |
| DnD State Desync (v1.0 #9) | Clickable cards add click vs drag ambiguity (Pitfall 10) |
| Env Variable Drift (v1.0 #11) | Docker containerization makes env management critical (Pitfall 5) |

---

## Sources

**WebSocket + TanStack Query:**
- [TanStack Query WebSocket stale data discussion](https://github.com/TanStack/query/discussions/7180) -- race condition documentation
- [TanStack Query + WebSocket integration guide](https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/) -- pattern recommendations
- [Fastify WebSocket guide](https://betterstack.com/community/guides/scaling-nodejs/fastify-websockets/) -- connection management
- [@fastify/websocket npm](https://www.npmjs.com/package/@fastify/websocket) -- async handler pitfalls

**Claude CLI / SDK:**
- [Claude Code headless mode docs](https://code.claude.com/docs/en/headless) -- official CLI reference
- [GitHub Issue #771: Node.js spawn failure](https://github.com/anthropics/claude-code/issues/771)
- [GitHub Issue #4383: Docker ENOENT](https://github.com/anthropics/claude-code/issues/4383)
- [GitHub Issue #7326: EBADF error](https://github.com/anthropics/claude-code/issues/7326)
- [Claude MAX subscription usage](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)

**Telegram Bot:**
- [Telegram Bot FAQ - Rate Limits](https://core.telegram.org/bots/faq)
- [grammY Long Polling vs Webhooks](https://grammy.dev/guide/deployment-types)
- [grammY vs other frameworks comparison](https://grammy.dev/resources/comparison)
- [Scalable Telegram Bot with BullMQ](https://medium.com/@pushpesh0/building-a-scalable-telegram-bot-with-node-js-bullmq-and-webhooks-6b0070fcbdfc)

**Docker + Turborepo:**
- [Turborepo Docker guide](https://turborepo.dev/docs/guides/tools/docker)
- [turbo prune broken lockfile - Issue #3382](https://github.com/vercel/turborepo/issues/3382)
- [turbo prune injectWorkspacePackages - Issue #10584](https://github.com/vercel/turborepo/issues/10584)
- [pnpm Docker guide](https://pnpm.io/docker)
- [Next.js NEXT_PUBLIC_ Docker discussion](https://github.com/vercel/next.js/discussions/17641)

**Sidebar / Navigation:**
- [Next.js Layouts documentation](https://nextjs.org/docs/pages/building-your-application/routing/pages-and-layouts)
- [Next.js Layouts pitfalls and patterns](https://thelinuxcode.com/nextjs-layouts-app-router-and-pages-router-practical-patterns-pitfalls-and-performance/)

**dnd-kit Click vs Drag:**
- [dnd-kit Issue #591: Click on draggable](https://github.com/clauderic/dnd-kit/issues/591)
- [dnd-kit Issue #800: onClick not firing](https://github.com/clauderic/dnd-kit/issues/800)
- [dnd-kit Discussion #476: Click vs drag distinction](https://github.com/clauderic/dnd-kit/discussions/476)

---

**Confidence:** MEDIUM-HIGH
- WebSocket + polling race: HIGH (documented in TanStack Query issues, verified against codebase)
- Claude CLI spawn issues: HIGH (multiple open GitHub issues with reproduction)
- Docker + turbo prune: HIGH (verified via GitHub issues, known pnpm compatibility problems)
- NEXT_PUBLIC_ Docker issue: HIGH (thousands of GitHub discussions)
- Telegram patterns: MEDIUM-HIGH (well-documented API, standard security practices)
- Sidebar/DnD patterns: HIGH (verified against existing codebase code paths)

**Validation Required:**
- @fastify/websocket v11+ compatibility with Fastify 5 (verify current npm version)
- turbo prune + pnpm behavior with current versions (test with project's exact versions)
- Claude CLI spawn reliability improvements (check for fixes to Issues #771, #4383, #7326)
- grammY webhook integration with Fastify (verify webhookCallback adapter exists for Fastify)
