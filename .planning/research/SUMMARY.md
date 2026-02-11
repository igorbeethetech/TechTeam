# Research Summary: TechTeam Platform

**Domain:** AI Agent Orchestration Platform for Software Development
**Researched:** 2026-02-11
**Overall confidence:** MEDIUM

> **Research Limitations:** WebSearch and WebFetch unavailable during research. Findings based on training data (January 2025 cutoff, 6-18 months stale), project context analysis, and established domain patterns. All version numbers and best practices require validation against current 2026 official documentation.

## Executive Summary

The TechTeam Platform is an AI agent orchestration system that automates software development from requirements to merged code through a 7-phase pipeline (Inbox → Discovery → Planning → Development → Testing → Merge → Done). The platform targets multi-tenant SaaS delivery (AI Development as a Service) with Bee The Tech as the initial tenant.

**Stack Decision:** The user has pre-selected a modern, production-grade stack: Next.js 15 (frontend), Fastify (backend API), PostgreSQL (data), Redis/BullMQ (job queue), Turborepo monorepo, Prisma ORM, Tailwind CSS + shadcn/ui (UI), @dnd-kit (Kanban drag-and-drop), and TanStack Query (data fetching). This stack is sound for the use case and aligns with 2024-2025 industry best practices for multi-tenant SaaS platforms.

**Architecture Pattern:** Separation of concerns with async job queue is critical. The architecture must decouple agent execution (long-running, 2-30 minutes) from HTTP request/response (fast, <100ms) using BullMQ. The 3-tier merge strategy (auto-merge → AI conflict resolution → human escalation) is the core differentiator, requiring careful implementation to avoid becoming a bottleneck.

**Critical Success Factors:**
1. **Multi-tenant isolation** — Tenant data leakage is the highest-risk failure mode. Prisma middleware enforcing global `tenantId` filtering is non-negotiable.
2. **Cost control** — Runaway token costs can destroy unit economics. Per-phase token budgets and cost alerts are MVP requirements, not post-launch features.
3. **Concurrency management** — 3 concurrent Development jobs per project is the sweet spot. More = merge conflict chaos. Requires BullMQ concurrency grouping by projectId.
4. **Agent reliability** — Jobs will fail (API timeouts, hallucinations, rate limits). BullMQ retry logic + Redis persistence + PostgreSQL state reconciliation prevents stuck demands.

**Roadmap Implication:** The MVP should launch in 10-12 weeks across 4 phases: Foundation (auth, projects, Kanban UI), Agent Pipeline (BullMQ + Discovery agent), Development Automation (Planning, Development, Testing agents + PR creation), and Merge & Metrics (auto-merge + cost dashboard). Defer real-time WebSocket, Telegram bot, Agent Teams migration, and advanced analytics to post-validation phases.

## Key Findings

**Stack:** Next.js 15 + Fastify + PostgreSQL + Redis/BullMQ + Turborepo monorepo with Prisma ORM, TanStack Query polling, shadcn/ui components, and Claude CLI headless mode for agent execution. Versions require 2026 verification.

**Architecture:** Async job queue architecture with BullMQ workers executing Claude CLI (`claude -p`) as child processes. Multi-tenant filtering via Prisma middleware. Polling-first data fetching (TanStack Query refetchInterval) for MVP, WebSocket migration post-validation. Branch-per-demand Git strategy with 3-tier merge escalation.

**Critical pitfall:** Tenant data leakage (multi-tenant isolation failure) — missing `tenantId` filter on a single query can expose competitor data, violate compliance, and destroy platform credibility. Mitigation: Prisma middleware + integration tests + code review checklist.

## Implications for Roadmap

Based on research, suggested phase structure:

### **Phase 1: Foundation (Week 1-2)**
**Goal:** Validate UI/UX for demand input and Kanban visualization

**Addresses:**
- User authentication with JWT and tenant isolation (PITFALLS.md: Tenant Data Leakage prevention)
- Project CRUD with repository configuration
- Demand creation form with Zod validation
- Static Kanban board (7 columns, no drag-and-drop yet)
- PostgreSQL + Prisma schema with multi-tenant indexes

**Avoids:**
- Premature WebSocket implementation (FEATURES.md: Anti-Feature)
- Agent execution complexity (defer to Phase 2)
- Real-time updates (polling added in Phase 2)

**Success Criteria:** User can log in, create project, create demand, see it in Inbox column

---

### **Phase 2: Agent Pipeline (Week 3-5)**
**Goal:** Prove agent orchestration works end-to-end

**Addresses:**
- BullMQ job queue setup with Redis persistence (PITFALLS.md: Job Loss prevention)
- Discovery agent (simplest phase — analysis only, no code generation)
- Agent execution logs stored in PostgreSQL
- TanStack Query polling (5s interval) for UI updates
- Per-phase token budgets and cost tracking (PITFALLS.md: Runaway Costs prevention)

**Avoids:**
- Complex Development/Testing agents (defer to Phase 3)
- Drag-and-drop (UI complexity, defer)
- Concurrent job execution (start with serial, add concurrency in Phase 4)

**Success Criteria:** Demand moves from Inbox → Discovery → Planning with agent logs visible in UI

---

### **Phase 3: Development Automation (Week 6-8)**
**Goal:** Demonstrate demand → code generation → PR creation

**Addresses:**
- Planning agent (task decomposition, architecture decisions)
- Development agent (code generation, atomic commits, branch creation)
- Testing agent (basic validation, test execution)
- PR creation workflow via GitHub API (Octokit)
- Git integration (clone, branch, commit, push)

**Avoids:**
- 3-tier merge automation (manual merge for Phase 3, automate in Phase 4)
- Concurrent Development jobs (serial execution for Phase 3)
- Advanced conflict resolution (PITFALLS.md: Concurrent Merge Conflicts — risk too high for early phase)

**Success Criteria:** Demand flows Inbox → Discovery → Planning → Development → Testing → PR created in GitHub

---

### **Phase 4: Merge & Metrics (Week 9-10)**
**Goal:** Production-ready MVP for Bee The Tech internal use

**Addresses:**
- Auto-merge strategy (Tier 1: green CI auto-merges PR)
- Concurrency control (max 3 concurrent Development jobs per project via BullMQ grouping)
- Metrics dashboard (tokens/cost per demand, time per phase, demands/week)
- Notifications (failures, completion, human intervention required)

**Avoids:**
- Tier 2/3 merge escalation (AI conflict resolution, human escalation — defer to post-MVP)
- Advanced analytics (trend analysis, cost forecasting — requires historical data)
- Custom agent prompts (hardcoded prompts validate workflow first)

**Success Criteria:** End-to-end automation from demand input → merged code, with cost visibility and concurrency working

---

### **Post-MVP: Enhancements (Week 11+)**

**Deferred features requiring validation:**
- Real-time WebSocket updates (replace polling)
- Tier 2/3 merge escalation (AI conflict resolution, human review)
- Telegram bot integration
- Agent Teams migration (replace `claude -p` headless mode)
- Predictive cost estimation (requires historical data)
- Cross-phase learning (agent context propagation)
- Custom phase templates
- Advanced RBAC

**Phase ordering rationale:**
- **Foundation first:** Auth + multi-tenant setup must be solid before any agent work (security foundation)
- **Discovery before Development:** Discovery is simplest agent (no code generation), validates BullMQ + Claude CLI integration with low risk
- **Serial before Concurrent:** Phase 3 proves Development agent works in isolation; Phase 4 adds concurrency (avoiding Pitfall 3: Concurrent Merge Conflicts during learning phase)
- **Metrics last:** Requires execution data from Phases 2-3; can't build analytics without historical logs

**Research flags for phases:**
- **Phase 1: Foundation** — Standard patterns, unlikely to need additional research. Multi-tenant setup is well-documented.
- **Phase 2: Agent Pipeline** — May need deeper research on Claude CLI headless mode capabilities and limitations (not well-documented in training data, LOW confidence).
- **Phase 3: Development Automation** — Likely needs research on GitHub API PR creation edge cases (draft PRs, commit signing, branch protection rules).
- **Phase 4: Merge & Metrics** — Needs research on BullMQ concurrency grouping (verify BullMQ 5.x supports `groupKey` feature, MEDIUM confidence based on training data).
- **Post-MVP: Agent Teams** — Requires deep research on Agent Teams API stability, migration path, and comparison with headless mode.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | MEDIUM | Stack choices validated by user, align with 2024-2025 best practices. Version numbers require 2026 verification (Next.js 15, Fastify 5.x, Prisma 6.x, BullMQ 5.x). |
| **Features** | MEDIUM | Feature breakdown based on project context (PROJECT.md) and training data patterns for AI platforms. Competitive analysis outdated (WebSearch unavailable). |
| **Architecture** | MEDIUM | Multi-tenant SaaS patterns well-established. BullMQ concurrency grouping requires verification. Claude CLI headless mode details sparse (LOW confidence on edge cases). |
| **Pitfalls** | MEDIUM | Common pitfalls (tenant leakage, job loss, merge conflicts, cost runaway) well-documented in training data. Specific mitigation code examples require 2026 verification. |

## Gaps to Address

### Research Gaps (Could Not Validate)

1. **Current 2026 versions:**
   - Next.js 15 stability status (released? LTS?)
   - Prisma 6.x release status and PostgreSQL 16 compatibility
   - BullMQ 5.x current version and `groupKey` concurrency feature
   - Turborepo 2.x release status
   - TanStack Query 5.x current version

2. **Claude CLI headless mode (`claude -p`):**
   - Official documentation quality (sparse in training data)
   - JSON output schema stability
   - Error handling patterns (API failures, timeouts, rate limits)
   - Resource limits (max output size, execution time limits)
   - Process isolation best practices

3. **Agent Teams migration path:**
   - Current stability status (experimental in 2024)
   - API comparison with headless mode
   - Migration complexity and breaking changes
   - Performance characteristics (speed, cost, reliability)

4. **Competitive landscape:**
   - Current AI agent orchestration platforms (2026)
   - Feature expectations from users of similar tools
   - Pricing/cost tracking norms
   - Multi-tenant SaaS offerings in this space

### Phase-Specific Research Needed Later

| Phase | Research Topic | When to Investigate | Why Deferred |
|-------|---------------|---------------------|--------------|
| **Phase 2** | Claude CLI headless mode edge cases | Before implementation | Low documentation quality, need official docs + experimentation |
| **Phase 3** | GitHub API PR creation patterns | Before implementation | Branch protection, draft PRs, commit signing, webhook integration |
| **Phase 4** | BullMQ concurrency grouping | Before implementation | Verify `groupKey` feature exists in BullMQ 5.x, alternative approaches if not |
| **Post-MVP** | WebSocket implementation patterns | After MVP validation | TanStack Query → WebSocket migration path, connection state management |
| **Post-MVP** | Agent Teams API stability | After MVP validation | Experimental in 2024, may be stable by mid-2026 |
| **Post-MVP** | AI conflict resolution (Tier 2 merge) | After Tier 1 auto-merge working | Complex agent coordination, requires Phase 3-4 learnings |

### Validation Actions Required

**Before Phase 1 starts:**
- [ ] Verify Next.js 15 release status and stability (check https://nextjs.org/docs)
- [ ] Verify Prisma 6.x + PostgreSQL 16 compatibility (check https://www.prisma.io/docs)
- [ ] Verify BullMQ 5.x current version (check https://docs.bullmq.io/)
- [ ] Check Claude CLI headless mode documentation (check https://docs.anthropic.com or Claude CLI `--help`)

**Before Phase 2 starts:**
- [ ] Prototype BullMQ + Redis persistence setup (verify AOF + RDB configuration)
- [ ] Prototype Claude CLI `claude -p` execution (verify JSON output format, error handling)
- [ ] Test Prisma middleware multi-tenant filtering (benchmark performance impact)

**Before Phase 4 starts:**
- [ ] Verify BullMQ concurrency grouping feature (check official docs, test implementation)
- [ ] Research GitHub API rate limits for automated PR creation (check current limits)

### Open Questions

1. **Claude CLI process isolation:** What's the recommended working directory structure? How to prevent cross-demand contamination? Does Claude CLI support custom temp directories?

2. **BullMQ concurrency grouping:** Does BullMQ 5.x support `groupKey` for limiting concurrency per group (projectId)? If not, what's the alternative pattern?

3. **Cost estimation accuracy:** What's the variance in token usage for similar demands? Can we predict costs within 20% accuracy using historical data?

4. **GitHub token security:** Should we use GitHub Apps instead of personal access tokens for better security and rate limits? What's the setup complexity?

5. **Agent hallucination frequency:** What percentage of agent executions produce incorrect output? Do we need a validation agent between Planning → Development?

6. **Tenant isolation performance:** Does Prisma middleware filtering add significant query overhead at scale (10K+ tenants)? Should we use Postgres RLS instead?

## Recommendations

### Immediate Actions (Pre-Phase 1)

1. **Validate stack versions:**
   - Check all library current versions against official docs
   - Create proof-of-concept Turborepo monorepo with Next.js 15 + Fastify
   - Test Prisma 6.x + PostgreSQL 16 compatibility

2. **Prototype critical paths:**
   - Test Claude CLI headless mode (`claude -p`) with JSON output
   - Test BullMQ Redis persistence (AOF + RDB) and recovery
   - Test Prisma middleware multi-tenant filtering performance

3. **Set up development environment:**
   - Docker Compose for PostgreSQL 16 + Redis 7
   - Turborepo monorepo structure (apps/web, apps/api, packages/shared)
   - Shared Zod schemas and Prisma client in packages/shared

### Strategic Decisions

1. **Start with `claude -p` headless mode, evaluate Agent Teams later:**
   - Headless mode is proven and documented
   - Agent Teams was experimental in 2024, may be stable by mid-2026
   - Migration path exists (replace executor implementation, keep BullMQ orchestration)

2. **Polling-first, WebSocket later:**
   - 5s polling is acceptable for MVP (not real-time, but near-real-time)
   - Reduces complexity significantly (no connection state, reconnection, broadcasting)
   - TanStack Query handles polling + caching elegantly
   - Clear upgrade path (add WebSocket, remove refetchInterval)

3. **Serial execution in Phase 3, concurrency in Phase 4:**
   - Prove Development agent works correctly in isolation first
   - Add concurrency once merge conflicts are understood and mitigated
   - Reduces debugging complexity during learning phase

4. **Tier 1 auto-merge only in MVP, Tier 2/3 post-validation:**
   - Tier 1 (auto-merge green CI PRs) is low-risk, high-value
   - Tier 2 (AI conflict resolution) is high-complexity, needs separate research phase
   - Tier 3 (human escalation) can be manual process initially (notify user)

### Risk Mitigation Priorities

**High Priority (Address in Phase 1-2):**
- [ ] Multi-tenant isolation (Prisma middleware + integration tests)
- [ ] Redis persistence (AOF + RDB configuration)
- [ ] Token budgets and cost alerts
- [ ] Environment variable validation (@fastify/env + Zod)

**Medium Priority (Address in Phase 3-4):**
- [ ] Concurrent merge conflict prevention (branch per demand, max 3 concurrent)
- [ ] Agent execution timeouts (generous limits + retry logic)
- [ ] GitHub API rate limiting (Octokit throttling plugin)
- [ ] Job queue monitoring (BullMQ UI, alerts on failures)

**Low Priority (Post-MVP):**
- [ ] Advanced RBAC (team-level permissions)
- [ ] Agent performance analytics (A/B testing, model comparison)
- [ ] Cost forecasting (predictive estimation)
- [ ] Custom phase templates (workflow customization)

## Success Metrics for Roadmap Validation

**Phase 1 Success:**
- User can create account, log in, create project, create demand
- Demand appears in Kanban Inbox column
- No tenant data leakage (verified by integration tests)

**Phase 2 Success:**
- Demand moves Inbox → Discovery → Planning via agent execution
- Agent logs visible in UI with token counts and cost
- No stuck demands (BullMQ job recovery works)

**Phase 3 Success:**
- Demand flows end-to-end: Inbox → Discovery → Planning → Development → Testing → PR created
- PR contains code generated by Development agent
- Atomic commits visible in PR (not single massive commit)

**Phase 4 Success:**
- 3 concurrent demands in Development phase without merge conflicts
- Tier 1 auto-merge works (green CI PRs merged automatically)
- Metrics dashboard shows accurate cost/tokens per demand

**MVP Success (End of Phase 4):**
- Bee The Tech team uses platform for real work (dog-fooding)
- 10+ demands processed end-to-end successfully
- Cost per demand predictable within 50% margin
- No critical bugs (tenant leakage, job loss, stuck demands)

---

*Research summary for: TechTeam Platform (AI Agent Orchestration)*
*Researched: 2026-02-11*
*Overall Confidence: MEDIUM (stack validated, versions require 2026 verification, competitive analysis limited)*

**Next Steps:**
1. Validate stack versions against 2026 official documentation
2. Prototype BullMQ + Claude CLI integration
3. Create roadmap based on this research (4 phases, 10-12 weeks)
4. Begin Phase 1: Foundation implementation
