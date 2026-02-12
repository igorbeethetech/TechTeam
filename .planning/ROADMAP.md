# Roadmap: TechTeam Platform

## Overview

The TechTeam Platform delivers AI-powered software development automation through a 6-phase build-out. Starting from infrastructure and auth, each phase adds a coherent layer of capability: project management UI, agent orchestration pipeline, code generation agents, merge automation with concurrency control, and finally observability with metrics and notifications. By the end, demands flow from human input to merged code with full visibility via a Kanban dashboard.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Monorepo, database, auth, multi-tenant isolation, and project CRUD
- [x] **Phase 2: Kanban and Demands** - Interactive board with 7 columns, demand creation, and detail views
- [x] **Phase 3: Agent Pipeline** - BullMQ job queue, Discovery agent, Planning agent, and agent execution tracking
- [x] **Phase 4: Development and Testing** - Code generation agent, PR creation, testing agent, and feedback loop
- [x] **Phase 5: Merge and Concurrency** - 3-tier merge strategy, merge queue, and concurrent development control
- [ ] **Phase 6: Metrics and Notifications** - Cost/performance dashboards and in-app notification system

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
- [x] 01-01-PLAN.md — Monorepo scaffolding, Docker Compose, Prisma 7 schema, and shared packages
- [x] 01-02-PLAN.md — Better Auth setup (register, login, logout, session persistence with organization plugin)
- [x] 01-03-PLAN.md — Multi-tenant Prisma Client Extensions and project CRUD API + UI

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
- [x] 02-01-PLAN.md — Demand model, API, tenant isolation, and Kanban board with drag-and-drop + polling
- [x] 02-02-PLAN.md — Demand creation form, project linking, and demand detail page with progress bar

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
- [x] 03-01-PLAN.md — AgentRun schema, BullMQ queue + worker infrastructure, Redis factory, base agent wrapper, agent-runs API, demand stage trigger
- [x] 03-02-PLAN.md — Discovery and Planning agents (prompt builders, structured output schemas, ambiguity detection, task decomposition)
- [x] 03-03-PLAN.md — Demand detail UI enhancements (RequirementsView, PlanView, AgentRunList components, agent status indicator)

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
- [x] 04-01-PLAN.md — Infrastructure: deps (simple-git, @octokit/rest), Prisma schema updates, shared output schemas, git/GitHub utilities, base agent extension, development agent
- [x] 04-02-PLAN.md — Testing agent, worker development/testing phase handlers, rejection feedback loop (max 3 cycles), demand stage trigger
- [x] 04-03-PLAN.md — Demand detail UI: DevelopmentView (branch, PR link, commit summary) and TestingReportView (verdict, test results, code quality)

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
- [x] 05-01-PLAN.md — Merge queue infrastructure, concurrency library, extended git/github utilities, auto-merge (Step 1), agent worker wiring
- [x] 05-02-PLAN.md — Merge-resolver AI agent (Step 2), human escalation (Step 3), merge retry/status API routes
- [x] 05-03-PLAN.md — Dev slot concurrency gating, worktree support, MergeStatusView dashboard component

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
- [ ] 06-01-PLAN.md — Schema updates (completedAt, Notification model), metrics API (cost, throughput, time per phase, success rate), metrics dashboard UI with charts
- [ ] 06-02-PLAN.md — Notification API, worker notification emission, notification bell with panel in dashboard header

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | ✓ Complete | 2026-02-12 |
| 2. Kanban and Demands | 2/2 | ✓ Complete | 2026-02-12 |
| 3. Agent Pipeline | 3/3 | ✓ Complete | 2026-02-12 |
| 4. Development and Testing | 3/3 | ✓ Complete | 2026-02-12 |
| 5. Merge and Concurrency | 3/3 | ✓ Complete | 2026-02-12 |
| 6. Metrics and Notifications | 0/2 | Not started | - |
