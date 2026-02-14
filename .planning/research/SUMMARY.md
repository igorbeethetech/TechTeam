# Research Summary: TechTeam Platform v1.1

**Domain:** AI Agent Orchestration Platform -- v1.1 Feature Additions
**Researched:** 2026-02-13
**Overall confidence:** HIGH

## Executive Summary

TechTeam Platform v1.0 is operational with a 7-stage agent pipeline (Inbox through Done), multi-tenant architecture, Kanban board with polling, and in-app notifications. The v1.1 milestone adds five capabilities: Claude MAX integration (CLI subprocess for subscription-based execution), WebSocket real-time updates (replacing polling), Telegram bot notifications (push alerts for pipeline events), Docker production deploy (containerize for VPS), and a Jira-style sidebar navigation (collapsible sidebar with project switcher).

The stack additions are deliberately minimal: only 2 new npm packages (`@fastify/websocket` and `grammy`), plus the shadcn/ui sidebar component (code-only, no new dependency). The Claude MAX feature uses Node.js built-in `child_process.spawn`. Docker deployment leverages existing `turbo prune` from Turborepo. This restraint is intentional -- the existing stack already provides the infrastructure foundation, and v1.1 features are additive rather than architectural changes.

The most technically interesting integration is the WebSocket + TanStack Query pattern: rather than pushing full data over WebSocket (duplicating REST API shapes), the server pushes lightweight event notifications that trigger `queryClient.invalidateQueries()`, causing TanStack Query to refetch via the existing REST endpoints. This preserves the current data fetching patterns while eliminating polling overhead. The worker-to-API bridge uses Redis PubSub (existing `ioredis` dependency), since BullMQ workers run in a separate process and cannot directly access Fastify's WebSocket connections.

The Claude MAX CLI integration is architecturally significant because it creates a dual execution path. The current `base-agent.ts` uses `@anthropic-ai/claude-agent-sdk` to call the Anthropic API directly. The new CLI executor spawns `claude -p` as a child process, which uses the user's MAX subscription instead of API credits. Both paths produce the same output format, selected by a config flag. Known risks include Claude CLI ENOENT spawn errors in Docker containers and MAX weekly usage limits that are not truly unlimited.

## Key Findings

**Stack:** Add only `@fastify/websocket` (^11.0.0) and `grammy` (^1.40.0) to backend. Frontend gets shadcn sidebar component (0 new deps). Claude MAX uses built-in `child_process.spawn`. Docker uses existing `turbo prune`.

**Architecture:** WebSocket events flow Worker -> Redis PubSub -> API WS handler -> Browser -> TanStack Query invalidation. This preserves existing REST data fetching while eliminating polling. Telegram is send-only (no webhook/polling needed).

**Critical pitfall:** Claude CLI subprocess in Docker containers has documented ENOENT spawn errors due to PATH inheritance issues. Must be validated and solved during Docker deployment work.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Sidebar Navigation Overhaul** - Do first because it restructures the dashboard layout that all other features render within. Changing navigation after WebSocket/notifications are wired creates rework.
   - Addresses: Jira-style sidebar, project switcher, collapsible icon mode
   - Avoids: No new dependencies, no backend changes

2. **WebSocket Real-Time** - Second because it replaces polling across the entire UI. Once sidebar is stable, wire real-time events into the new layout.
   - Addresses: Replace 5 polling points, add Redis PubSub worker bridge, TanStack Query invalidation
   - Avoids: Full data push (use event-based invalidation instead)

3. **Telegram Bot Notifications** - Third because it hooks into the existing notification creation points (already in workers). WebSocket provides in-app real-time; Telegram provides out-of-app push.
   - Addresses: grammY send-only integration, tenant settings for Telegram chat ID
   - Avoids: Webhook/long-polling complexity (send-only pattern)

4. **Claude MAX Integration** - Fourth because it is an alternative execution mode, not a replacement. Existing SDK mode continues working. This can be implemented independently.
   - Addresses: CLI subprocess executor, config toggle, dual-mode agent execution
   - Avoids: Replacing existing SDK approach (keep both)

5. **Docker Production Deploy** - Last because it containerizes everything built in phases 1-4. All features must be stable before containerization.
   - Addresses: Multi-stage Dockerfiles, turbo prune, Next.js standalone, production docker-compose
   - Avoids: Kubernetes/Swarm (single VPS, Docker Compose sufficient)

**Phase ordering rationale:**
- Sidebar first: Layout restructuring is the foundation. Building WebSocket hooks or notification UIs into the old header-nav layout and then migrating to sidebar creates churn.
- WebSocket before Telegram: Both are notification channels, but WebSocket is the in-app backbone. Telegram integration is additive and simpler.
- Claude MAX before Docker: CLI subprocess needs to work on host first. Docker adds PATH/env complexity that is easier to debug when the subprocess logic is already validated.
- Docker last: Containerization captures all features. Doing it earlier means re-building Dockerfiles when code changes for each feature.

**Research flags for phases:**
- Phase 2 (WebSocket): Needs careful planning -- Redis PubSub bridge between worker process and API server is a new architectural pattern for this codebase
- Phase 4 (Claude MAX): Known Docker container issues with Claude CLI spawn. Needs experimentation and fallback planning
- Phase 5 (Docker): `turbo prune --docker` with pnpm requires testing the exact layer caching behavior. Prisma binary targets for Alpine need verification

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm. Only 2 new packages. @fastify/websocket and grammy both confirmed compatible with existing stack. |
| Features | HIGH | All 5 features clearly scoped. Integration points identified in existing codebase (specific files and line numbers). |
| Architecture | HIGH | WebSocket event-based invalidation pattern is well-documented by TkDodo (TanStack maintainer). Redis PubSub bridge is a standard pattern. |
| Pitfalls | HIGH | Claude CLI Docker spawn issues documented with GitHub issue links. MAX usage limits confirmed. WebSocket auth on upgrade requests needs attention. |

## Gaps to Address

- **Claude CLI exact flags for tool allowlisting:** The `--allowedTools` flag syntax needs verification against current Claude CLI `--help` output. Training data may be stale.
- **@fastify/websocket auth on upgrade:** Fastify hooks run on WS routes, but the exact auth decorator behavior during the HTTP upgrade handshake needs testing.
- **Prisma binary targets for Alpine Docker:** Prisma 7 may need explicit `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` in schema.prisma for Alpine containers.
- **Telegram rate limits:** Telegram Bot API has rate limits (~30 messages/second). If many demands complete simultaneously, need queuing. Likely not an issue at current scale but worth noting.
- **Next.js standalone + monorepo:** The standalone output copies node_modules, but workspace package resolution (`workspace:*`) behavior in standalone mode needs verification.

---

*Research summary for: TechTeam Platform v1.1 features*
*Researched: 2026-02-13*
*Overall Confidence: HIGH*
