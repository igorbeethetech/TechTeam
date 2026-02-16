# Roadmap: TechTeam Platform

## Overview

The TechTeam Platform delivers AI-powered software development automation through an incremental build-out across two milestones. v1.0 (Phases 1-6) established the core platform: infrastructure, Kanban board, agent pipeline, code generation, merge automation, and observability. v1.1 (Phases 7-11) improves the user experience with sidebar navigation, replaces polling with WebSocket real-time updates, adds Claude MAX as an alternative execution mode, containerizes everything for production deployment, and validates the full pipeline end-to-end.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v1.0 -- Core Platform (Complete)

- [x] **Phase 1: Foundation** - Monorepo, database, auth, multi-tenant isolation, and project CRUD
- [x] **Phase 2: Kanban and Demands** - Interactive board with 7 columns, demand creation, and detail views
- [x] **Phase 3: Agent Pipeline** - BullMQ job queue, Discovery agent, Planning agent, and agent execution tracking
- [x] **Phase 4: Development and Testing** - Code generation agent, PR creation, testing agent, and feedback loop
- [x] **Phase 5: Merge and Concurrency** - 3-tier merge strategy, merge queue, and concurrent development control
- [x] **Phase 6: Metrics and Notifications** - Cost/performance dashboards and in-app notification system

### v1.1 -- UX Improvements and Production Readiness (Active)

- [x] **Phase 7: Sidebar Navigation and Boards** - Collapsible sidebar, dedicated Boards page, and clickable demand cards
- [x] **Phase 8: WebSocket Real-Time** - Replace polling with WebSocket event-based cache invalidation via Redis PubSub
- [x] **Phase 9: Claude MAX Integration** - Feature-flagged CLI subprocess executor as alternative to Anthropic API key
- [ ] **Phase 10: Docker Production Deploy** - Multi-stage Dockerfiles, production compose, and single-command VPS deployment
- [ ] **Phase 11: Pipeline E2E Validation** - Full pipeline test from Inbox through Done on a real repository

## Phase Details

### Phase 1: Foundation
**Goal**: Users can authenticate, manage projects, and the platform enforces complete tenant isolation from day one
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, AUTH-01, AUTH-02, AUTH-03, AUTH-04, TENANT-01, TENANT-02, TENANT-03, TENANT-04, PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05
**Success Criteria** (what must be TRUE):
  1. User can create an account, log in, and session persists across browser refreshes
  2. User can create a project with repo URL, repo path, tech stack, and concurrency settings
  3. User can list, edit, and archive projects -- and only sees projects belonging to their own tenant
  4. Monorepo builds successfully with shared types between frontend and backend
  5. Docker Compose starts PostgreSQL and Redis with a single command, and Prisma migrations run cleanly
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md -- Monorepo scaffolding, Docker Compose, Prisma 7 schema, and shared packages
- [x] 01-02-PLAN.md -- Better Auth setup (register, login, logout, session persistence with organization plugin)
- [x] 01-03-PLAN.md -- Multi-tenant Prisma Client Extensions and project CRUD API + UI

### Phase 2: Kanban and Demands
**Goal**: Users can visualize their workflow on a Kanban board and create demands that flow through the pipeline
**Depends on**: Phase 1
**Requirements**: BOARD-01, BOARD-02, BOARD-03, BOARD-04, BOARD-05, DEM-01, DEM-02, DEM-03
**Success Criteria** (what must be TRUE):
  1. User sees a Kanban board with 7 columns (Inbox, Discovery, Planning, Development, Testing, Merge, Done)
  2. User can create a demand with title, description, and priority, linked to a project
  3. Demand cards show title, priority, agent status, and accumulated cost -- and can be dragged between columns
  4. Board refreshes automatically every 5 seconds via polling without manual reload
**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md -- Demand model, API, tenant isolation, and Kanban board with drag-and-drop + polling
- [x] 02-02-PLAN.md -- Demand creation form, project linking, and demand detail page with progress bar

### Phase 3: Agent Pipeline
**Goal**: Demands move automatically through Discovery and Planning phases via AI agents, with full execution visibility
**Depends on**: Phase 2
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06, AGENT-07, DISC-01, DISC-02, DISC-03, DISC-04, PLAN-01, PLAN-02, PLAN-03, DEM-04, DEM-05, DEM-06
**Success Criteria** (what must be TRUE):
  1. When a demand enters Discovery, a BullMQ job is queued and a Claude CLI agent executes automatically
  2. Discovery agent produces structured requirements and complexity estimate; Planning agent produces a decomposed technical plan
  3. Demand detail page shows output of each phase (requirements JSON, plan JSON) and lists all Agent Runs with tokens, cost, and duration
  4. Failed agent jobs retry up to 3 times with exponential backoff, and per-phase timeouts prevent runaway execution
  5. If Discovery detects ambiguity, the demand pauses and the user is notified
**Plans:** 3 plans

Plans:
- [x] 03-01-PLAN.md -- AgentRun schema, BullMQ queue + worker infrastructure, Redis factory, base agent wrapper, agent-runs API, demand stage trigger
- [x] 03-02-PLAN.md -- Discovery and Planning agents (prompt builders, structured output schemas, ambiguity detection, task decomposition)
- [x] 03-03-PLAN.md -- Demand detail UI enhancements (RequirementsView, PlanView, AgentRunList components, agent status indicator)

### Phase 4: Development and Testing
**Goal**: Demands generate real code on isolated branches, create PRs, and undergo automated quality review
**Depends on**: Phase 3
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, CONC-04
**Success Criteria** (what must be TRUE):
  1. Development agent creates an isolated branch (demand/{id}-{slug}), executes code changes in the repo, and makes atomic commits
  2. Upon completion, a Pull Request is created automatically with the generated code
  3. Testing agent reviews the PR against the original plan and requirements, runs project tests, and produces an approval or rejection report
  4. If testing rejects the PR, the demand returns to Development with feedback for the agent to address
**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md -- Infrastructure: deps (simple-git, @octokit/rest), Prisma schema updates, shared output schemas, git/GitHub utilities, base agent extension, development agent
- [x] 04-02-PLAN.md -- Testing agent, worker development/testing phase handlers, rejection feedback loop (max 3 cycles), demand stage trigger
- [x] 04-03-PLAN.md -- Demand detail UI: DevelopmentView (branch, PR link, commit summary) and TestingReportView (verdict, test results, code quality)

### Phase 5: Merge and Concurrency
**Goal**: Approved PRs merge automatically through escalating strategies, and multiple demands develop concurrently without conflict
**Depends on**: Phase 4
**Requirements**: MERGE-01, MERGE-02, MERGE-03, MERGE-04, MERGE-05, CONC-01, CONC-02, CONC-03
**Success Criteria** (what must be TRUE):
  1. Merge queue processes approved PRs in FIFO order per project
  2. Step 1 auto-merge succeeds for clean PRs; Step 2 AI conflict resolution attempts to resolve merge conflicts; Step 3 escalates unresolvable conflicts to the user with context displayed on the board
  3. User can resolve conflicts externally and signal resolution in the dashboard to resume the pipeline
  4. Up to N demands (maxConcurrentDev per project) run in Development simultaneously; excess demands wait in queue
  5. Discovery and Planning phases run in parallel across demands without blocking each other
**Plans:** 3 plans across 2 waves

Plans:
- [x] 05-01-PLAN.md -- Merge queue infrastructure, concurrency library, extended git/github utilities, auto-merge (Step 1), agent worker wiring
- [x] 05-02-PLAN.md -- Merge-resolver AI agent (Step 2), human escalation (Step 3), merge retry/status API routes
- [x] 05-03-PLAN.md -- Dev slot concurrency gating, worktree support, MergeStatusView dashboard component

### Phase 6: Metrics and Notifications
**Goal**: Users have full visibility into platform costs, agent performance, and receive timely alerts for events requiring attention
**Depends on**: Phase 5
**Requirements**: METR-01, METR-02, METR-03, METR-04, NOTIF-01, NOTIF-02, NOTIF-03
**Success Criteria** (what must be TRUE):
  1. Dashboard shows total cost per project for the current month
  2. Dashboard shows demands completed per week as a chart, average time per phase, and agent success rate
  3. User receives in-app notification when an agent fails, when merge needs human intervention, and when a demand reaches Done
**Plans:** 2 plans across 2 waves

Plans:
- [x] 06-01-PLAN.md -- Schema updates (completedAt, Notification model), metrics API (cost, throughput, time per phase, success rate), metrics dashboard UI with charts
- [x] 06-02-PLAN.md -- Notification API, worker notification emission, notification bell with panel in dashboard header

---

### Phase 7: Sidebar Navigation and Boards
**Goal**: Users navigate the platform through a persistent sidebar with project switching, and interact with demand cards via direct click-to-detail
**Depends on**: Phase 6 (builds on existing dashboard layout)
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, NAV-07
**Success Criteria** (what must be TRUE):
  1. User sees a collapsible sidebar with links to Dashboard, Boards, Projects, Metrics, and Settings -- replacing the current top header navigation
  2. Sidebar displays a list of the user's projects with direct links that navigate to each project's Kanban board
  3. Sidebar collapse/expand state persists across page navigations (user does not lose their preference)
  4. User can navigate to a dedicated "Boards" page, see all projects listed, select one, and land on that project's Kanban board
  5. User can click a demand card's title text on the Kanban board to navigate to the demand detail page, while drag-and-drop still works via a separate drag handle area
**Plans:** 2 plans across 2 waves

Plans:
- [x] 07-01-PLAN.md -- Install shadcn sidebar, create AppSidebar component, restructure dashboard layout to replace header nav
- [x] 07-02-PLAN.md -- Boards API endpoint with demand counts, Boards page UI, Kanban card drag handle refactor with click-to-navigate

### Phase 8: WebSocket Real-Time
**Goal**: The platform updates in real-time without polling -- board changes, agent status, and notifications appear instantly via WebSocket
**Depends on**: Phase 7 (sidebar layout must be stable before wiring real-time events into it)
**Requirements**: WS-01, WS-02, WS-03, WS-04, WS-05, WS-06, WS-07, WS-08
**Success Criteria** (what must be TRUE):
  1. Kanban board reflects demand movements and agent status changes within 1-2 seconds without any page refresh or polling interval
  2. Demand detail page shows agent run progress and status updates in real-time as agents execute
  3. WebSocket connections are tenant-isolated -- a user in Tenant A never receives events from Tenant B
  4. If the WebSocket connection drops (network issue, server restart), the frontend automatically reconnects and falls back to polling until reconnection succeeds
  5. No polling timers remain active on pages that have an active WebSocket connection (polling is fully replaced, not layered on top)
**Plans:** 3 plans across 2 waves

Plans:
- [x] 08-01-PLAN.md -- Shared WS event types, Redis PubSub connections, @fastify/websocket plugin, authenticated /ws route with tenant-scoped connection map and heartbeat
- [x] 08-02-PLAN.md -- Worker event emission: publishWsEvent calls in agent.worker.ts and merge.worker.ts after every state mutation
- [x] 08-03-PLAN.md -- Frontend useWebSocket hook with reconnection/invalidation, WebSocketProvider, replace polling with conditional refetchInterval in all components

### Phase 9: Claude MAX Integration
**Goal**: Users with a Claude MAX subscription can run agents using their subscription instead of paying per-API-call, configured via a simple toggle in Settings
**Depends on**: Phase 8 (real-time events should reflect CLI execution status the same way they reflect SDK execution)
**Requirements**: CMAX-01, CMAX-02, CMAX-03, CMAX-04, CMAX-05
**Success Criteria** (what must be TRUE):
  1. User sees a toggle on the Settings page to switch between "API Key" mode and "Claude MAX" mode for agent execution
  2. In Claude MAX mode, agents execute successfully via `claude -p` CLI subprocess and produce the same structured output as SDK mode
  3. Agent execution mode is stored per tenant -- switching mode affects all agents for that tenant without code changes
  4. If CLI subprocess fails (spawn error, timeout, malformed output), the error is surfaced clearly in the agent run log and BullMQ retries using the same retry logic as SDK mode
**Plans:** 2 plans across 2 waves

Plans:
- [x] 09-01-PLAN.md -- Prisma AgentExecutionMode enum + TenantSettings field, CLI executor (base-agent-cli.ts), agent router (agent-router.ts)
- [x] 09-02-PLAN.md -- Wire all 5 agents through router, Settings API agentExecutionMode support, Settings page execution mode toggle

### Phase 10: Docker Production Deploy
**Goal**: The entire platform can be deployed to a VPS with a single `docker compose up -d` command, with all services containerized and production-ready
**Depends on**: Phase 9 (all features must be stable before containerization; Claude CLI needs to work in Docker)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05, DEPLOY-06, DEPLOY-07
**Success Criteria** (what must be TRUE):
  1. Running `docker compose up -d` starts all services (API, web, worker, PostgreSQL, Redis) and the application is accessible in a browser
  2. Database migrations run automatically on container startup without manual intervention
  3. All configuration (database URL, Redis URL, API keys, domain) is managed via a single .env file
  4. Worker container can clone repositories and execute Git operations (git is available and volume mounts or built-in tools work correctly)
  5. Both API and web containers use multi-stage builds with turbo prune, resulting in minimal production images (no dev dependencies, no source maps)
**Plans:** 3 plans across 2 waves

Plans:
- [x] 10-01-PLAN.md -- Relocate worker.ts into src/, create API Dockerfile (3-stage turbo prune), migration entrypoint script
- [x] 10-02-PLAN.md -- Update next.config.ts for standalone output, create Web Dockerfile (3-stage turbo prune)
- [x] 10-03-PLAN.md -- Production docker-compose.prod.yml, .env.example, .dockerignore, full stack build and verification

### Phase 11: Pipeline E2E Validation
**Goal**: A demand flows through the complete pipeline from Inbox to Done on a real repository, proving the entire system works end-to-end
**Depends on**: Phase 10 (validates everything built in phases 1-10, ideally on the production Docker setup)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):
  1. A demand submitted via the dashboard flows through all 7 stages (Inbox, Discovery, Planning, Development, Testing, Merge, Done) without manual intervention beyond initial submission
  2. Development agent creates a real branch with real code changes and opens a PR on the target repository
  3. Testing agent reviews the PR and produces a clear approval or rejection with rationale
  4. An approved PR is merged automatically into the main branch via the merge queue
  5. If the testing agent rejects the PR, the demand returns to Development, the agent addresses the feedback, and the cycle repeats (up to 3 times) before escalating

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-02-12 |
| 2. Kanban and Demands | 2/2 | Complete | 2026-02-12 |
| 3. Agent Pipeline | 3/3 | Complete | 2026-02-12 |
| 4. Development and Testing | 3/3 | Complete | 2026-02-12 |
| 5. Merge and Concurrency | 3/3 | Complete | 2026-02-12 |
| 6. Metrics and Notifications | 2/2 | Complete | 2026-02-12 |
| 7. Sidebar Navigation and Boards | 2/2 | Complete | 2026-02-14 |
| 8. WebSocket Real-Time | 3/3 | Complete | 2026-02-14 |
| 9. Claude MAX Integration | 2/2 | Complete | 2026-02-14 |
| 10. Docker Production Deploy | 3/3 | Complete | 2026-02-16 |
| 11. Pipeline E2E Validation | 0/? | Pending | -- |
