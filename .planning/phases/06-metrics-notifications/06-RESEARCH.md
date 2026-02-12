# Phase 6: Metrics and Notifications - Research

**Researched:** 2026-02-12
**Domain:** Dashboard metrics/charts, in-app notification system, PostgreSQL aggregations
**Confidence:** HIGH

## Summary

Phase 6 adds two capabilities to TechTeam: (1) a metrics dashboard displaying cost per project, demands completed per week (chart), average time per phase, and agent success rate, and (2) an in-app notification system triggered by agent failures, merge escalations, and demand completions.

The codebase already stores all raw data needed for metrics -- `Demand.totalCostUsd`, `Demand.totalTokens`, `AgentRun.costUsd`, `AgentRun.durationMs`, `AgentRun.status`, and `Demand.stage` with timestamps. The challenge is aggregation: Prisma's `groupBy` does not support date extraction functions (e.g., `EXTRACT(WEEK FROM ...)`) natively, so the metrics API endpoints require `$queryRaw` or `$queryRawUnsafe` for time-based aggregations. For notifications, the simplest approach that fits the existing polling architecture is a `Notification` database table polled by the frontend, with notifications created by the worker/queue processors at the moment events occur.

**Primary recommendation:** Use shadcn/ui Chart component (Recharts v2 under the hood) for all dashboard charts. Use a `Notification` Prisma model + polling endpoint for in-app notifications, following the same 5s polling pattern established by the Kanban board. Emit notifications from the existing worker code at the point of failure/completion/escalation.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^2.15 (via shadcn chart) | Charting (bar, line, area) | shadcn/ui's built-in chart component uses Recharts v2; Recharts v3 support not yet merged into shadcn |
| shadcn/ui chart | latest (CLI install) | Chart wrapper components | Already using shadcn/ui for all UI; `ChartContainer`, `ChartTooltip`, `ChartLegend` provide consistent styling |
| sonner | ^2.0.7 (already installed) | Toast notifications for new notification alerts | Already in use and configured with `<Toaster>` in root layout |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.x | Date formatting/manipulation for chart labels | Format week labels, month labels, relative timestamps |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts v2 (via shadcn) | Recharts v3 directly | v3 is stable (3.7.0) but shadcn chart component not yet updated (PR #8486 still open); would need custom chart wrapper |
| Recharts | Tremor | Higher-level API but less customization, adds another dependency when shadcn already provides charts |
| Database polling for notifications | WebSocket/SSE | Over-engineering for v1; polling pattern already established in Kanban board; WebSocket is v2 (RT-01/RT-02 in requirements) |
| Notification DB table | Redis pub/sub | Ephemeral; loses notifications if user is offline; DB table persists and supports read/unread tracking |

**Installation:**
```bash
# In apps/web
pnpm dlx shadcn@latest add chart
pnpm add date-fns

# No new backend dependencies needed -- Prisma $queryRaw handles aggregations
```

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
├── routes/
│   ├── metrics.ts          # GET /api/metrics/cost, /api/metrics/throughput, etc.
│   └── notifications.ts    # GET /api/notifications, PATCH /api/notifications/:id/read
├── queues/
│   ├── agent.worker.ts     # (existing) Add notification creation on failure
│   └── merge.worker.ts     # (existing) Add notification creation on needs_human/done

apps/web/src/
├── app/(dashboard)/
│   ├── metrics/
│   │   └── page.tsx        # Metrics dashboard page
│   └── layout.tsx          # (existing) Add notification bell to header
├── components/
│   ├── metrics/
│   │   ├── cost-by-project.tsx
│   │   ├── demands-per-week-chart.tsx
│   │   ├── avg-time-per-phase.tsx
│   │   └── agent-success-rate.tsx
│   └── notifications/
│       ├── notification-bell.tsx
│       ├── notification-list.tsx
│       └── notification-item.tsx

packages/database/prisma/
└── schema.prisma           # Add Notification model
```

### Pattern 1: Metrics API with Raw SQL Aggregation
**What:** Use Prisma's `$queryRaw` for time-based grouping (week, month) since `groupBy` does not support `EXTRACT()` functions.
**When to use:** Any metric that requires date-part grouping (demands per week, cost per month).
**Example:**
```typescript
// Source: Prisma docs + PostgreSQL EXTRACT
// apps/api/src/routes/metrics.ts

// METR-01: Cost per project (current month)
fastify.get("/cost", async (request, reply) => {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const costs = await request.prisma.demand.groupBy({
    by: ["projectId"],
    _sum: { totalCostUsd: true },
    _count: { id: true },
    where: {
      createdAt: { gte: startOfMonth },
    },
  })

  // Join with project names
  const projectIds = costs.map(c => c.projectId)
  const projects = await request.prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true },
  })

  const projectMap = new Map(projects.map(p => [p.id, p.name]))

  return {
    costs: costs.map(c => ({
      projectId: c.projectId,
      projectName: projectMap.get(c.projectId) ?? "Unknown",
      totalCostUsd: c._sum.totalCostUsd ?? 0,
      demandCount: c._count.id,
    })),
  }
})
```

```typescript
// METR-02: Demands completed per week (requires raw SQL)
// Prisma groupBy cannot do EXTRACT(WEEK FROM ...) natively
import { prisma } from "@techteam/database"

fastify.get("/throughput", async (request, reply) => {
  const tenantId = request.session!.session.activeOrganizationId!

  const result = await prisma.$queryRaw<
    { week: number; year: number; count: bigint }[]
  >`
    SELECT
      EXTRACT(ISOYEAR FROM "updatedAt")::int AS year,
      EXTRACT(WEEK FROM "updatedAt")::int AS week,
      COUNT(*)::bigint AS count
    FROM "Demand"
    WHERE "tenantId" = ${tenantId}
      AND "stage" = 'done'
      AND "updatedAt" >= NOW() - INTERVAL '12 weeks'
    GROUP BY year, week
    ORDER BY year, week
  `

  return {
    throughput: result.map(r => ({
      year: r.year,
      week: r.week,
      count: Number(r.count),
    })),
  }
})
```

### Pattern 2: Notification Table + Worker Emission
**What:** Workers create Notification rows in DB at the moment events happen. Frontend polls for unread notifications.
**When to use:** Any event that needs user attention (NOTIF-01, NOTIF-02, NOTIF-03).
**Example:**
```typescript
// In agent.worker.ts catch block (on agent failure):
await prisma.notification.create({
  data: {
    type: "agent_failed",
    title: `Agent failed: ${phase} phase`,
    message: `Agent failed for demand "${demand.title}" during ${phase} phase`,
    demandId,
    projectId,
    read: false,
  } as any,
})
```

### Pattern 3: Polling with TanStack Query for Notifications
**What:** Use the same refetchInterval pattern as the Kanban board (5s) for notification count, with a slower poll (30s) for the full list.
**When to use:** Notification bell badge count and dropdown list.
**Example:**
```typescript
// Source: Existing pattern from kanban-board.tsx
const { data: unreadCount } = useQuery({
  queryKey: ["notifications", "unread-count"],
  queryFn: () => api.get<{ count: number }>("/api/notifications/unread-count"),
  refetchInterval: 10_000, // 10 seconds for badge count
})
```

### Pattern 4: shadcn/ui Chart with Recharts Composition
**What:** Use ChartContainer + Recharts components for all dashboard charts. shadcn chart does NOT wrap Recharts -- you use Recharts components directly inside ChartContainer.
**When to use:** All charts in the metrics dashboard.
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/radix/chart
"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  count: {
    label: "Demands",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

export function DemandsPerWeekChart({ data }: { data: { week: string; count: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" />
        <YAxis />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
```

### Anti-Patterns to Avoid
- **Aggregating in JavaScript:** Never fetch all demands/agent runs and aggregate client-side. Always use SQL aggregation (Prisma groupBy or $queryRaw) for metrics.
- **Creating notifications synchronously in request handlers:** Notifications should be created by workers (async job processors), not in API route handlers where they'd add latency to user requests.
- **Using ResponsiveContainer with shadcn chart:** The `ChartContainer` component already handles responsive sizing. Do NOT wrap with Recharts' `ResponsiveContainer` as it conflicts.
- **Polling all notification fields at badge frequency:** Poll only the unread count at high frequency (10s). Full notification list polls at lower frequency (30s) or on dropdown open.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Charts | Custom SVG/Canvas rendering | shadcn/ui chart + Recharts | Responsive, accessible, themed to match existing UI |
| Date grouping in SQL | Manual date parsing in JS | PostgreSQL `EXTRACT()` via `$queryRaw` | Database handles time zones, ISO weeks, performance |
| Toast/alert overlay | Custom notification popover | sonner (already installed) | Already configured, supports rich content and actions |
| Notification badge animation | Custom CSS animations | Tailwind `animate-pulse` + conditional rendering | Consistent with existing agent status indicators |
| Time formatting | Manual date math | date-fns `formatDistanceToNow`, `format` | Handles locales, edge cases, relative time |

**Key insight:** The hardest part of this phase is the SQL aggregation queries, not the UI. The charting and notification UI patterns already exist in the codebase (shadcn components, sonner toasts, TanStack Query polling). The backend aggregation is where complexity lives.

## Common Pitfalls

### Pitfall 1: BigInt serialization from $queryRaw
**What goes wrong:** PostgreSQL `COUNT(*)` returns `bigint`, which Prisma passes through as JavaScript `BigInt`. `JSON.stringify` throws on `BigInt` values.
**Why it happens:** Prisma's raw query returns native PostgreSQL types. Fastify uses JSON serialization.
**How to avoid:** Always cast `COUNT(*)::int` in SQL, or map results through `Number()` before returning from the API.
**Warning signs:** `TypeError: Do not know how to serialize a BigInt` in API responses.

### Pitfall 2: Tenant isolation in $queryRaw
**What goes wrong:** The `forTenant()` Prisma extension only applies to Prisma Client operations (`findMany`, `groupBy`, etc.). Raw SQL queries bypass tenant isolation entirely.
**Why it happens:** `$queryRaw` executes raw SQL that the extension cannot intercept.
**How to avoid:** Always include `WHERE "tenantId" = ${tenantId}` in every raw SQL query. Use parameterized queries (tagged template literals) to prevent SQL injection. Consider using the base `prisma` import for raw queries and manually injecting the tenant filter.
**Warning signs:** Metrics showing data from other tenants; missing WHERE clause on tenantId.

### Pitfall 3: Chart min-height requirement
**What goes wrong:** Charts render as zero-height invisible elements.
**Why it happens:** shadcn/ui's `ChartContainer` requires an explicit `min-h-[VALUE]` class. Without it, the Recharts ResponsiveContainer inside gets 0 height.
**How to avoid:** Always set `className="min-h-[300px] w-full"` (or similar) on `ChartContainer`.
**Warning signs:** Chart component mounts but nothing visible; no console errors.

### Pitfall 4: Notification creation in transaction-less workers
**What goes wrong:** Agent run fails, error is logged, but notification is not created because the notification creation itself throws.
**Why it happens:** Network issues, database connection pool exhaustion during error handling paths.
**How to avoid:** Wrap notification creation in a try-catch within the worker's error handler. Never let notification creation failure mask the original error.
**Warning signs:** Agent failures visible in AgentRun table but no corresponding notifications.

### Pitfall 5: Empty chart data for new projects
**What goes wrong:** Charts crash or show confusing UI when there are zero data points (no demands completed yet).
**Why it happens:** Recharts components can behave unexpectedly with empty data arrays.
**How to avoid:** Always check `data.length === 0` and show an empty state message instead of rendering the chart with empty data.
**Warning signs:** Blank chart areas, console warnings about missing data keys.

### Pitfall 6: Stale updatedAt timestamps for "demands completed per week"
**What goes wrong:** The `updatedAt` field on Demand is used to determine when a demand reached "done", but any subsequent update changes this timestamp.
**Why it happens:** Prisma's `@updatedAt` directive auto-updates on every write.
**How to avoid:** Either (a) use the `updatedAt` of the last AgentRun with `phase: 'merge'` and `status: 'completed'`, or (b) add a `completedAt` field to the Demand model that is explicitly set only when stage transitions to "done". Option (b) is recommended for clean querying.
**Warning signs:** Demands showing up in wrong weeks; demand moved to Done in week 3 but showing in week 5 because something updated later.

## Code Examples

### Metrics API: Average time per phase (METR-03)
```typescript
// Uses Prisma groupBy -- no raw SQL needed since grouping by enum (phase), not date
fastify.get("/avg-time-per-phase", async (request, reply) => {
  const stats = await request.prisma.agentRun.groupBy({
    by: ["phase"],
    _avg: { durationMs: true },
    _count: { id: true },
    where: {
      status: "completed",
    },
  })

  return {
    phases: stats.map(s => ({
      phase: s.phase,
      avgDurationMs: Math.round(s._avg.durationMs ?? 0),
      totalRuns: s._count.id,
    })),
  }
})
```

### Metrics API: Agent success rate (METR-04)
```typescript
// Uses Prisma groupBy on status enum
fastify.get("/agent-success-rate", async (request, reply) => {
  const stats = await request.prisma.agentRun.groupBy({
    by: ["status"],
    _count: { id: true },
  })

  const total = stats.reduce((sum, s) => sum + s._count.id, 0)
  const completed = stats.find(s => s.status === "completed")?._count.id ?? 0
  const failed = stats.find(s => s.status === "failed")?._count.id ?? 0

  return {
    total,
    completed,
    failed,
    successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    byStatus: stats.map(s => ({
      status: s.status,
      count: s._count.id,
    })),
  }
})
```

### Notification Model (Prisma schema addition)
```prisma
model Notification {
  id         String           @id @default(cuid())
  tenantId   String
  type       NotificationType
  title      String
  message    String
  demandId   String?
  projectId  String?
  read       Boolean          @default(false)
  createdAt  DateTime         @default(now())

  demand     Demand?          @relation(fields: [demandId], references: [id], onDelete: SetNull)
  project    Project?         @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@index([tenantId, read, createdAt])
  @@index([tenantId, createdAt])
}

enum NotificationType {
  agent_failed     // NOTIF-01
  merge_needs_human // NOTIF-02
  demand_done      // NOTIF-03
}
```

### Notification Bell Component Pattern
```typescript
"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import { api } from "@/lib/api"
import { Badge } from "@/components/ui/badge"

export function NotificationBell() {
  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/api/notifications/unread-count"),
    refetchInterval: 10_000,
  })

  const count = data?.count ?? 0

  return (
    <button className="relative">
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  )
}
```

### Worker notification emission pattern
```typescript
// In agent.worker.ts, inside the catch block where agentStatus is set to "failed"
// After: await prisma.demand.update({ where: { id: demandId }, data: { agentStatus: "failed" } })

// NOTIF-01: Notify on agent failure
try {
  const demand = await prisma.demand.findUnique({
    where: { id: demandId },
    select: { title: true, projectId: true },
  })
  if (demand) {
    await prisma.notification.create({
      data: {
        type: "agent_failed",
        title: `Agent failed: ${phase}`,
        message: `Agent failed for "${demand.title}" during ${phase}. Error: ${errorMessage.slice(0, 200)}`,
        demandId,
        projectId: demand.projectId,
      } as any,
    })
  }
} catch (notifErr) {
  console.warn("[agent-worker] Failed to create notification:", notifErr)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts v2 | Recharts v3 (3.7.0 latest) | 2025 | Better hooks API, accessibility defaults, cleaner internals. But shadcn chart component still on v2 (PR #8486 not merged) |
| Prisma $queryRaw (untyped) | Prisma TypedSQL (.sql files) | Prisma 5.19+ (preview) | Type-safe raw SQL. Still preview feature; GA expected Q1 2026. Not yet stable enough to depend on for Prisma 7 |
| WebSocket notifications | Polling + DB table | Ongoing | Simpler, more reliable for v1. WebSocket is v2 scope (RT-01/RT-02 in requirements) |

**Deprecated/outdated:**
- Recharts `<ResponsiveContainer>` as a direct wrapper: Use shadcn's `<ChartContainer>` instead when using shadcn chart
- Tremor v1 API: Tremor has been restructured. Not relevant since we use shadcn charts directly

## Open Questions

1. **Notification retention policy**
   - What we know: Notifications will accumulate over time in the database
   - What's unclear: Should old notifications be auto-pruned? After how many days?
   - Recommendation: Add a `createdAt` index and plan for a cleanup job later (not blocking for v1). Keep last 100 per tenant as a soft limit in the API response.

2. **Demand completedAt field**
   - What we know: Using `updatedAt` for "when was this demand completed" is unreliable since any later update changes it
   - What's unclear: Whether adding a `completedAt` field is needed now or can be deferred
   - Recommendation: Add `completedAt DateTime?` to the Demand model in this phase. Set it once when stage transitions to "done". Use it for the "demands per week" chart. Low-risk schema change.

3. **Multi-project vs single-project metrics view**
   - What we know: METR-01 says "cost per project" (implying cross-project view). Other metrics could be per-project or global.
   - What's unclear: Should the dashboard show all projects at once or have a project selector?
   - Recommendation: Default to showing all projects (tenant-wide). Include a project filter dropdown for focused views. The API endpoints should accept an optional `projectId` query parameter.

## Sources

### Primary (HIGH confidence)
- Prisma aggregation docs: https://www.prisma.io/docs/orm/prisma-client/queries/aggregation-grouping-summarizing - groupBy, aggregate, count API reference
- shadcn/ui chart docs: https://ui.shadcn.com/docs/components/radix/chart - ChartContainer, ChartTooltip, installation, Recharts composition pattern
- Existing codebase: `packages/database/prisma/schema.prisma` - Demand.totalCostUsd, AgentRun.costUsd/durationMs/status fields confirmed
- Existing codebase: `apps/web/src/components/board/kanban-board.tsx` - 5s polling pattern with TanStack Query refetchInterval
- Existing codebase: `apps/web/src/app/layout.tsx` - Sonner Toaster already configured at root

### Secondary (MEDIUM confidence)
- Recharts v3 migration guide: https://github.com/recharts/recharts/wiki/3.0-migration-guide - API largely compatible with v2
- shadcn/ui Recharts v3 PR: https://github.com/shadcn-ui/ui/pull/8486 - Still open as of 2026-02-06, not yet merged
- Prisma groupBy date limitations: https://github.com/prisma/prisma/discussions/22088 - Confirmed groupBy cannot use EXTRACT(); $queryRaw required

### Tertiary (LOW confidence)
- Prisma TypedSQL GA timeline: https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/typedsql - "GA between September 2025 - February 2026" -- status for Prisma 7 specifically is unclear

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - shadcn chart is the natural fit (already using shadcn/ui); Recharts v2 is battle-tested
- Architecture: HIGH - Aggregation patterns are well-documented Prisma + PostgreSQL; notification table pattern is straightforward
- Pitfalls: HIGH - BigInt serialization, tenant isolation bypass in raw SQL, and chart min-height are all well-known issues with strong documentation
- Notification system: HIGH - Simple DB-backed polling matches existing architecture; all trigger points are clearly identified in worker code

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (stable domain; shadcn Recharts v3 support may land which would affect chart setup)
