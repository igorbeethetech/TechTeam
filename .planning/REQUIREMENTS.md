# Requirements: TechTeam Platform

**Defined:** 2026-02-11
**Core Value:** Demandas de desenvolvimento fluem automaticamente do input humano ate codigo pronto para merge, com agentes IA executando cada fase e o humano tendo visibilidade total via dashboard Kanban.

## v1.0 Requirements (Complete)

All 68 requirements shipped and validated via UAT on 2026-02-13.

### Infrastructure (Phase 1) ✓
- [x] **INFRA-01** through **INFRA-05**: Monorepo, Docker Compose, Prisma, shared types, Fastify API

### Authentication (Phase 1) ✓
- [x] **AUTH-01** through **AUTH-04**: Register, login, logout, session persistence

### Multi-Tenant (Phase 1) ✓
- [x] **TENANT-01** through **TENANT-04**: tenantId isolation, auto-filtering, Bee The Tech seed

### Projects (Phase 1) ✓
- [x] **PROJ-01** through **PROJ-05**: CRUD, repo config, concurrency settings, archive

### Kanban Board (Phase 2) ✓
- [x] **BOARD-01** through **BOARD-05**: 7 columns, drag-drop, polling, card content

### Demands (Phases 2-3) ✓
- [x] **DEM-01** through **DEM-06**: Create, project link, detail page, phase outputs, agent runs, metrics

### Agent Pipeline (Phase 3) ✓
- [x] **AGENT-01** through **AGENT-07**: BullMQ queue, worker execution, retry, timeouts

### Discovery Agent (Phase 3) ✓
- [x] **DISC-01** through **DISC-04**: Requirements extraction, complexity, ambiguity detection

### Planning Agent (Phase 3) ✓
- [x] **PLAN-01** through **PLAN-03**: Technical plan, task decomposition, file mapping

### Development Agent (Phase 4) ✓
- [x] **DEV-01** through **DEV-04**: Branch creation, code execution, atomic commits, PR creation

### Testing Agent (Phase 4) ✓
- [x] **TEST-01** through **TEST-05**: PR review, test execution, approval/rejection, feedback loop

### Merge (Phase 5) ✓
- [x] **MERGE-01** through **MERGE-05**: FIFO queue, auto-merge, AI resolve, human escalation

### Concurrency (Phases 4-5) ✓
- [x] **CONC-01** through **CONC-04**: Dev slot limiting, queue, parallel discovery/planning, branch isolation

### Metrics (Phase 6) ✓
- [x] **METR-01** through **METR-04**: Cost per project, demands/week chart, time per phase, success rate

### Notifications (Phase 6) ✓
- [x] **NOTIF-01** through **NOTIF-03**: Agent failure, merge intervention, demand completion

## v1.1 Requirements

Requirements for v1.1 release. Each maps to roadmap phases (7-11).

### Navigation and UX

- [x] **NAV-01**: User sees a collapsible sidebar with navigation links (Dashboard, Boards, Projects, Metrics, Settings) replacing the current top header nav
- [x] **NAV-02**: Sidebar shows project list with direct links to each project's board
- [x] **NAV-03**: Sidebar collapses to icon-only mode and persists collapse state across page navigations
- [x] **NAV-04**: User can access a dedicated "Boards" page that lists all projects with board access
- [x] **NAV-05**: On the Boards page, user can select a project and navigate to its Kanban board
- [x] **NAV-06**: Demand card text on the Kanban board is clickable to navigate to demand detail page
- [x] **NAV-07**: Clicking demand card text navigates to detail while drag-and-drop still works via separate drag handle

### WebSocket Real-Time

- [ ] **WS-01**: API server establishes WebSocket connections with authenticated clients via @fastify/websocket
- [ ] **WS-02**: WebSocket connections are scoped to the user's tenant (tenant isolation on WS channels)
- [ ] **WS-03**: Worker events (agent status change, demand update, notification) are published via Redis PubSub to the API server
- [ ] **WS-04**: API server broadcasts relevant events to connected WebSocket clients in the same tenant
- [ ] **WS-05**: Frontend receives WebSocket events and triggers TanStack Query cache invalidation (not full data push)
- [ ] **WS-06**: Kanban board updates in real-time via WebSocket without polling
- [ ] **WS-07**: Demand detail page updates agent status and runs in real-time via WebSocket
- [ ] **WS-08**: Frontend falls back to polling if WebSocket connection drops, with automatic reconnection

### Claude MAX Integration

- [ ] **CMAX-01**: Settings page shows toggle to choose between "API Key" mode and "Claude MAX" mode for agent execution
- [ ] **CMAX-02**: In Claude MAX mode, agent worker spawns `claude -p` CLI subprocess instead of using the SDK
- [ ] **CMAX-03**: CLI subprocess output is parsed to extract structured JSON matching the same schemas as SDK output
- [ ] **CMAX-04**: Agent execution mode (SDK vs CLI) is configurable per tenant via TenantSettings
- [ ] **CMAX-05**: Failed CLI subprocess invocations produce clear error messages and retry via the same BullMQ retry logic

### Docker and Production Deploy

- [ ] **DEPLOY-01**: Multi-stage Dockerfile for apps/api with turbo prune and minimal production image
- [ ] **DEPLOY-02**: Multi-stage Dockerfile for apps/web with Next.js standalone output and turbo prune
- [ ] **DEPLOY-03**: Production docker-compose.yml that runs API, web, worker, PostgreSQL, and Redis
- [ ] **DEPLOY-04**: Environment variables are configurable via .env file for production deployment
- [ ] **DEPLOY-05**: Database migrations run automatically on container startup
- [ ] **DEPLOY-06**: Application can be deployed to a VPS with a single `docker compose up -d` command
- [ ] **DEPLOY-07**: Worker container has access to Git for repository operations (volume mount or built-in)

### Pipeline E2E Validation

- [ ] **PIPE-01**: A demand can flow through the complete pipeline: Inbox → Discovery → Planning → Development → Testing → Merge → Done
- [ ] **PIPE-02**: Development agent creates an isolated branch and pushes code changes to a real repository
- [ ] **PIPE-03**: Testing agent reviews the PR and produces approval or rejection report
- [ ] **PIPE-04**: Approved PRs are merged automatically via the merge queue
- [ ] **PIPE-05**: Rejected PRs trigger a feedback loop back to Development (up to 3 cycles)

## v2 Requirements (Deferred)

### Telegram Notifications
- **TELE-01**: User can link Telegram account to receive pipeline notifications
- **TELE-02**: Bot sends alerts for agent failures, merge conflicts, and demand completion
- **TELE-03**: User can configure which events trigger Telegram notifications

### Advanced Merge
- **AMERGE-01**: IA aprende com resolucoes anteriores de conflitos
- **AMERGE-02**: Diff viewer inline no dashboard para conflitos

### Analytics
- **ANAL-01**: Estimativa preditiva de custo baseada em historico
- **ANAL-02**: Comparacao de performance entre modelos de IA
- **ANAL-03**: Analise de tendencias (tempo por fase ao longo do tempo)

### Integrations
- **INT-01**: Slack/Discord notifications
- **INT-02**: API publica para integracoes externas

### Advanced Multi-Tenant
- **MT-01**: Onboarding self-service de novos tenants
- **MT-02**: Planos de assinatura (free/pro/enterprise) com limites
- **MT-03**: RBAC avancado (team-level permissions)

### Advanced UX
- **UX-01**: Jira-style project navigation sidebar on board page to switch between projects
- **UX-02**: Mobile-responsive sidebar with hamburger menu on small screens

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app nativa | Web-first, responsive design sufficient |
| Agent Teams experimental | SDK atual funciona, migrar quando estabilizar |
| Marketplace de agentes | Foco na pipeline core primeiro |
| Multi-idioma (i18n) | Portugues como idioma principal |
| Kubernetes/Swarm | Single VPS com Docker Compose suficiente para v1.1 |
| Full WebSocket data push | Event-based invalidation preserva TanStack Query patterns |
| Telegram bot (v1.1) | Deferred to v1.2 per user choice -- WebSocket first |
| Multi-model (GPT-4, Gemini) | Claude-only simplifica prompts e custos |
| Real-time collaboration | Single owner per demand, race conditions nao valem complexidade |

## Traceability

### v1.0 (Phases 1-6) -- Complete

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01..05 | Phase 1 | Complete |
| AUTH-01..04 | Phase 1 | Complete |
| TENANT-01..04 | Phase 1 | Complete |
| PROJ-01..05 | Phase 1 | Complete |
| BOARD-01..05 | Phase 2 | Complete |
| DEM-01..03 | Phase 2 | Complete |
| DEM-04..06, AGENT-01..07, DISC-01..04, PLAN-01..03 | Phase 3 | Complete |
| DEV-01..04, TEST-01..05, CONC-04 | Phase 4 | Complete |
| MERGE-01..05, CONC-01..03 | Phase 5 | Complete |
| METR-01..04, NOTIF-01..03 | Phase 6 | Complete |

### v1.1 (Phases 7-11) -- Active

| Requirement | Phase | Status |
|-------------|-------|--------|
| NAV-01 | Phase 7 | Complete |
| NAV-02 | Phase 7 | Complete |
| NAV-03 | Phase 7 | Complete |
| NAV-04 | Phase 7 | Complete |
| NAV-05 | Phase 7 | Complete |
| NAV-06 | Phase 7 | Complete |
| NAV-07 | Phase 7 | Complete |
| WS-01 | Phase 8 | Pending |
| WS-02 | Phase 8 | Pending |
| WS-03 | Phase 8 | Pending |
| WS-04 | Phase 8 | Pending |
| WS-05 | Phase 8 | Pending |
| WS-06 | Phase 8 | Pending |
| WS-07 | Phase 8 | Pending |
| WS-08 | Phase 8 | Pending |
| CMAX-01 | Phase 9 | Pending |
| CMAX-02 | Phase 9 | Pending |
| CMAX-03 | Phase 9 | Pending |
| CMAX-04 | Phase 9 | Pending |
| CMAX-05 | Phase 9 | Pending |
| DEPLOY-01 | Phase 10 | Pending |
| DEPLOY-02 | Phase 10 | Pending |
| DEPLOY-03 | Phase 10 | Pending |
| DEPLOY-04 | Phase 10 | Pending |
| DEPLOY-05 | Phase 10 | Pending |
| DEPLOY-06 | Phase 10 | Pending |
| DEPLOY-07 | Phase 10 | Pending |
| PIPE-01 | Phase 11 | Pending |
| PIPE-02 | Phase 11 | Pending |
| PIPE-03 | Phase 11 | Pending |
| PIPE-04 | Phase 11 | Pending |
| PIPE-05 | Phase 11 | Pending |

**Coverage:**
- v1.0 requirements: 68 total -- 68 complete
- v1.1 requirements: 32 total (NAV: 7, WS: 8, CMAX: 5, DEPLOY: 7, PIPE: 5)
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-02-11*
*Last updated: 2026-02-13 after v1.1 roadmap creation*
