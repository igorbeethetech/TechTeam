# Phase 2: Kanban and Demands - Research

**Researched:** 2026-02-11
**Domain:** Drag-and-drop Kanban board, demand CRUD, real-time polling, pipeline visualization
**Confidence:** HIGH

## Summary

Phase 2 adds the visual heart of the platform: a 7-column Kanban board with drag-and-drop demand cards, demand creation with project linking, and a demand detail page with pipeline progress bar. This phase builds directly on Phase 1's foundation -- the Prisma schema, tenant isolation via Client Extensions, TanStack Query for data fetching, shadcn/ui components, and the Fastify API with auth/tenant middleware.

The primary technical challenge is implementing smooth drag-and-drop across 7 columns with optimistic UI updates and backend synchronization. The ecosystem has converged on `@dnd-kit/core` + `@dnd-kit/sortable` as the standard React drag-and-drop solution, and Dice UI provides a pre-built Kanban component layer on top of dnd-kit specifically designed for shadcn/ui projects. This eliminates the need to hand-roll the complex DndContext/SortableContext/DragOverlay orchestration. For auto-refresh, TanStack Query's `refetchInterval: 5000` provides polling with zero additional infrastructure, and optimistic updates via `useMutation` + `onMutate` ensure drag operations feel instant even before the API responds.

The Demand model extends the existing Prisma schema with a `projectId` foreign key (one-to-many from Project), `stage` enum matching the 7 pipeline columns, priority enum, and fields for future phases (complexity, requirements JSON, plan JSON, cost tracking). The API follows the same auth + tenant middleware pattern established in Phase 1 for project routes.

**Primary recommendation:** Use Dice UI Kanban component (`@diceui/kanban` via shadcn registry) for the board, @dnd-kit/core + @dnd-kit/sortable underneath, TanStack Query with `refetchInterval: 5000` for auto-polling, and optimistic updates via `useMutation` + `onMutate` for drag-and-drop state changes.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | 6.3.x | Drag-and-drop primitives (DndContext, sensors, collision detection) | Most popular React DnD library. ~10kb, zero external deps, accessible, keyboard support built-in. Design doc specifies it. |
| @dnd-kit/sortable | 10.0.x | Sortable presets (SortableContext, useSortable, verticalListSortingStrategy) | Official extension for sortable lists. Handles multi-container Kanban natively. |
| @dnd-kit/utilities | latest | CSS transform utilities for drag animations | Required helper for transform/transition calculations. |
| @dnd-kit/modifiers | latest | Drag behavior modifiers (axis locking, boundary constraints) | Optional but useful for restricting horizontal drag within board. |
| @diceui/kanban | latest (via shadcn registry) | Pre-built Kanban component set (Kanban, KanbanBoard, KanbanColumn, KanbanItem, KanbanOverlay) | Built on dnd-kit, designed for shadcn/ui. Provides accessible Kanban with keyboard nav, screen reader announcements, and DragOverlay out of the box. Eliminates ~300 lines of DnD boilerplate. |
| @tanstack/react-query | 5.90.x | Polling via refetchInterval, optimistic updates via useMutation + onMutate | Already installed from Phase 1. refetchInterval: 5000 meets BOARD-05 requirement with zero new deps. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-slot | latest | Component composition for Kanban asChild prop | Required by Dice UI Kanban component. |
| shadcn/ui Progress | latest | Pipeline progress bar on demand detail page (DEM-03) | Visual indicator of demand stage progress through 7 phases. |
| shadcn/ui Sheet | latest | Demand creation side panel / quick-view | Mobile-friendly alternative to full-page form for demand creation. |
| shadcn/ui Separator | latest | Visual column dividers in Kanban board | Clean column separation. |
| shadcn/ui Tooltip | latest | Truncated card info hover | Show full title/description on hover for compact cards. |
| react-hook-form | latest | Demand creation form with Zod validation | Already installed from Phase 1. Same pattern as project form. |
| zod | 3.x | Demand validation schemas (shared between frontend/backend) | Already installed. Extends packages/shared with demand schemas. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit/core + Dice UI | Raw @dnd-kit/core + custom components | More control but ~300 lines of boilerplate for DndContext, sensors, collision detection, DragOverlay, accessibility announcements. Dice UI handles all of this. |
| @dnd-kit/core | @dnd-kit/react (new rewrite) | @dnd-kit/react is at v0.2.4 (pre-1.0, experimental). Not production-ready. Stable @dnd-kit/core 6.3.x is the safe choice. The migration guide exists at next.dndkit.com when ready to upgrade. |
| @dnd-kit/core | @hello-pangea/dnd | Less flexible API, no sortable preset, weaker TypeScript support. dnd-kit is the ecosystem standard. |
| @dnd-kit/core | shadcn-kanban-board (janhesters) | Zero-dependency approach but uses custom DnD implementation instead of battle-tested dnd-kit. Less proven for complex multi-container scenarios. |
| TanStack Query polling | WebSocket (Socket.io) | WebSocket is overkill for v1 (BOARD-05 explicitly says polling). v2 requirement RT-01 will add WebSocket. Polling is simpler, reliable, and meets the 5-second refresh spec. |
| Optimistic updates | Wait for API response | Drag-and-drop feels laggy if card snaps back and then moves. Optimistic update provides instant visual feedback. |

**Installation (apps/web):**
```bash
# Dice UI Kanban (installs dnd-kit dependencies automatically)
npx shadcn@latest add "https://diceui.com/r/kanban"

# Additional shadcn components needed
npx shadcn@latest add progress separator tooltip sheet scroll-area

# If Dice UI registry install fails, install dnd-kit manually:
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers @radix-ui/react-slot
```

## Architecture Patterns

### Recommended Project Structure (additions to Phase 1)

```
apps/web/src/
├── app/(dashboard)/
│   ├── projects/
│   │   └── [projectId]/
│   │       └── board/
│   │           └── page.tsx          # Kanban board page (BOARD-01..05)
│   ├── demands/
│   │   ├── new/
│   │   │   └── page.tsx              # Demand creation page (DEM-01, DEM-02)
│   │   └── [demandId]/
│   │       └── page.tsx              # Demand detail page (DEM-03)
│   └── page.tsx                      # Dashboard home (existing)
├── components/
│   ├── board/
│   │   ├── kanban-board.tsx          # Main board component with DndContext + polling
│   │   ├── kanban-column.tsx         # Single column wrapper (stage name, count, droppable)
│   │   ├── demand-card.tsx           # Card showing title, priority, agent status, cost
│   │   └── board-header.tsx          # Board header with project name + "New Demand" button
│   ├── demands/
│   │   ├── demand-form.tsx           # Create demand form (react-hook-form + zod)
│   │   ├── demand-detail.tsx         # Demand detail with pipeline progress bar
│   │   └── pipeline-progress.tsx     # Visual progress indicator for 7 stages
│   └── ui/
│       ├── kanban.tsx                # Dice UI Kanban primitives (installed via registry)
│       ├── progress.tsx              # shadcn/ui Progress (for pipeline progress)
│       ├── sheet.tsx                 # shadcn/ui Sheet (for demand quick-create)
│       ├── separator.tsx             # shadcn/ui Separator
│       ├── tooltip.tsx               # shadcn/ui Tooltip
│       └── scroll-area.tsx           # shadcn/ui ScrollArea (for column overflow)

apps/api/src/
├── routes/
│   ├── demands.ts                    # Demand CRUD + stage update endpoints
│   └── projects.ts                   # Existing (add demands relation in responses)

packages/database/prisma/
├── schema.prisma                     # Add Demand model + enums

packages/shared/src/
├── schemas/
│   ├── demand.ts                     # Demand Zod schemas (create, update, stage-change)
│   └── project.ts                    # Existing
├── types/
│   └── index.ts                      # Add Demand interface + DemandStage type
└── constants/
    └── index.ts                      # PIPELINE_STAGES already exists, add PRIORITY_LEVELS
```

### Pattern 1: Kanban Board with Dice UI + TanStack Query Polling

**What:** Board component that fetches demands grouped by stage, renders 7 columns with Dice UI Kanban, polls every 5 seconds, and handles drag-and-drop with optimistic updates.
**When to use:** The main board page for each project (BOARD-01 through BOARD-05).

```typescript
// apps/web/src/components/board/kanban-board.tsx
// Source: Dice UI Kanban API (https://www.diceui.com/docs/components/kanban)
// Source: TanStack Query refetchInterval (https://tanstack.com/query/v5/docs/framework/react/reference/useQuery)
"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { PIPELINE_STAGES, type PipelineStage } from "@techteam/shared"
import { api } from "@/lib/api"
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem,
  KanbanOverlay,
} from "@/components/ui/kanban"
import { DemandCard } from "./demand-card"

interface Demand {
  id: string
  title: string
  stage: PipelineStage
  priority: string
  agentStatus: string | null
  totalCostUsd: number
}

// Shape expected by Dice UI Kanban: Record<UniqueIdentifier, T[]>
type BoardColumns = Record<PipelineStage, Demand[]>

function groupByStage(demands: Demand[]): BoardColumns {
  const columns = {} as BoardColumns
  for (const stage of PIPELINE_STAGES) {
    columns[stage] = demands.filter((d) => d.stage === stage)
  }
  return columns
}

export function KanbanBoardView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()

  // Fetch demands with 5-second polling (BOARD-05)
  const { data: demands = [] } = useQuery({
    queryKey: ["demands", projectId],
    queryFn: () => api.get<Demand[]>(`/api/demands?projectId=${projectId}`),
    refetchInterval: 5000,
  })

  const columns = groupByStage(demands)

  // Optimistic stage update on drag
  const moveCard = useMutation({
    mutationFn: (vars: { demandId: string; newStage: PipelineStage }) =>
      api.patch(`/api/demands/${vars.demandId}/stage`, { stage: vars.newStage }),
    onMutate: async ({ demandId, newStage }) => {
      await queryClient.cancelQueries({ queryKey: ["demands", projectId] })
      const previous = queryClient.getQueryData<Demand[]>(["demands", projectId])
      queryClient.setQueryData<Demand[]>(["demands", projectId], (old = []) =>
        old.map((d) => (d.id === demandId ? { ...d, stage: newStage } : d))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["demands", projectId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["demands", projectId] })
    },
  })

  function handleValueChange(newColumns: BoardColumns) {
    // Dice UI calls this when items move between columns
    // Diff against current state to find what moved
    for (const stage of PIPELINE_STAGES) {
      for (const demand of newColumns[stage]) {
        if (demand.stage !== stage) {
          moveCard.mutate({ demandId: demand.id, newStage: stage })
        }
      }
    }
  }

  return (
    <Kanban
      value={columns}
      onValueChange={handleValueChange}
      getItemValue={(item) => item.id}
    >
      <KanbanBoard className="grid grid-cols-7 gap-4">
        {PIPELINE_STAGES.map((stage) => (
          <KanbanColumn key={stage} value={stage} className="min-w-[200px]">
            <div className="flex items-center justify-between p-2">
              <h3 className="text-sm font-semibold capitalize">{stage}</h3>
              <span className="text-xs text-muted-foreground">
                {columns[stage]?.length ?? 0}
              </span>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {(columns[stage] ?? []).map((demand) => (
                <KanbanItem key={demand.id} value={demand.id} asHandle>
                  <DemandCard demand={demand} />
                </KanbanItem>
              ))}
            </div>
          </KanbanColumn>
        ))}
      </KanbanBoard>
      <KanbanOverlay>
        {({ value, variant }) => {
          if (variant === "item") {
            const demand = demands.find((d) => d.id === value)
            return demand ? <DemandCard demand={demand} /> : null
          }
          return null
        }}
      </KanbanOverlay>
    </Kanban>
  )
}
```

### Pattern 2: Demand Card Component

**What:** Compact card showing demand info in Kanban columns (BOARD-03).
**When to use:** Inside each KanbanItem.

```typescript
// apps/web/src/components/board/demand-card.tsx
"use client"

import { Badge } from "@/components/ui/badge"

const PRIORITY_COLORS = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
} as const

interface DemandCardProps {
  demand: {
    id: string
    title: string
    priority: string
    agentStatus: string | null
    totalCostUsd: number
  }
}

export function DemandCard({ demand }: DemandCardProps) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing">
      <p className="text-sm font-medium line-clamp-2">{demand.title}</p>
      <div className="mt-2 flex items-center justify-between">
        <Badge className={PRIORITY_COLORS[demand.priority as keyof typeof PRIORITY_COLORS]}>
          {demand.priority}
        </Badge>
        {demand.agentStatus && (
          <span className="text-xs text-muted-foreground">{demand.agentStatus}</span>
        )}
      </div>
      {demand.totalCostUsd > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          ${demand.totalCostUsd.toFixed(2)}
        </p>
      )}
    </div>
  )
}
```

### Pattern 3: Demand Prisma Schema Extension

**What:** Adding Demand model to existing Prisma schema, maintaining tenant isolation.
**When to use:** Database migration for Phase 2.

```prisma
// packages/database/prisma/schema.prisma (additions)

model Demand {
  id              String        @id @default(cuid())
  tenantId        String        // For tenant isolation via forTenant()
  projectId       String
  title           String
  description     String?       @db.Text
  stage           DemandStage   @default(inbox)
  priority        DemandPriority @default(medium)
  complexity      Complexity?   // Set by Discovery agent (Phase 3)
  requirements    Json?         // Set by Discovery agent (Phase 3)
  plan            Json?         // Set by Planning agent (Phase 3)
  branchName      String?       // Set by Development agent (Phase 4)
  prUrl           String?       // Set by Development agent (Phase 4)
  mergeStatus     MergeStatus?  // Set during Merge (Phase 5)
  mergeConflicts  Json?         // Set during Merge (Phase 5)
  mergeAttempts   Int           @default(0)
  totalTokens     Int           @default(0)
  totalCostUsd    Float         @default(0)
  createdBy       String        // userId from session
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  project         Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([projectId])
  @@index([stage])
  @@index([projectId, stage])
}

enum DemandStage {
  inbox
  discovery
  planning
  development
  testing
  merge
  done
}

enum DemandPriority {
  low
  medium
  high
  urgent
}

enum Complexity {
  S
  M
  L
  XL
}

enum MergeStatus {
  pending
  auto_merged
  conflict_resolving
  needs_human
  merged
}
```

**Critical:** Add "Demand" to TENANT_MODELS array in `packages/database/src/tenant.ts`:
```typescript
const TENANT_MODELS = ["Project", "Demand"] as const
```

And add the relation field to the existing Project model:
```prisma
model Project {
  // ... existing fields ...
  demands         Demand[]      // Add this relation
}
```

### Pattern 4: Demand CRUD API Routes

**What:** Fastify routes for demand operations, following Phase 1 project routes pattern.
**When to use:** All demand API endpoints.

```typescript
// apps/api/src/routes/demands.ts
import type { FastifyInstance } from "fastify"
import { demandCreateSchema, demandStageUpdateSchema } from "@techteam/shared"

export default async function demandRoutes(fastify: FastifyInstance) {
  // GET /api/demands?projectId=xxx — list demands for board
  fastify.get("/", async (request) => {
    const { projectId } = request.query as { projectId?: string }
    const where = projectId ? { projectId } : {}
    return request.prisma.demand.findMany({
      where,
      orderBy: { createdAt: "asc" },
    })
  })

  // POST /api/demands — create demand (DEM-01, DEM-02)
  fastify.post("/", async (request, reply) => {
    const data = demandCreateSchema.parse(request.body)
    const demand = await request.prisma.demand.create({
      data: {
        ...data,
        createdBy: request.session.user.id,
      },
    })
    return reply.status(201).send(demand)
  })

  // GET /api/demands/:id — demand detail (DEM-03)
  fastify.get("/:id", async (request) => {
    const { id } = request.params as { id: string }
    return request.prisma.demand.findUniqueOrThrow({ where: { id } })
  })

  // PATCH /api/demands/:id/stage — update stage (drag-and-drop)
  fastify.patch("/:id/stage", async (request) => {
    const { id } = request.params as { id: string }
    const { stage } = demandStageUpdateSchema.parse(request.body)
    return request.prisma.demand.update({
      where: { id },
      data: { stage },
    })
  })
}
```

### Pattern 5: Pipeline Progress Bar (DEM-03)

**What:** Visual progress indicator showing which stage a demand is in.
**When to use:** Demand detail page.

```typescript
// apps/web/src/components/demands/pipeline-progress.tsx
"use client"

import { PIPELINE_STAGES, type PipelineStage } from "@techteam/shared"
import { cn } from "@/lib/utils"

interface PipelineProgressProps {
  currentStage: PipelineStage
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  inbox: "Inbox",
  discovery: "Discovery",
  planning: "Planning",
  development: "Development",
  testing: "Testing",
  merge: "Merge",
  done: "Done",
}

export function PipelineProgress({ currentStage }: PipelineProgressProps) {
  const currentIndex = PIPELINE_STAGES.indexOf(currentStage)

  return (
    <div className="flex items-center gap-1 w-full">
      {PIPELINE_STAGES.map((stage, index) => (
        <div key={stage} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={cn(
              "h-2 w-full rounded-full",
              index <= currentIndex ? "bg-primary" : "bg-muted"
            )}
          />
          <span
            className={cn(
              "text-xs",
              index === currentIndex ? "font-semibold text-primary" : "text-muted-foreground"
            )}
          >
            {STAGE_LABELS[stage]}
          </span>
        </div>
      ))}
    </div>
  )
}
```

### Pattern 6: Shared Zod Schemas for Demands

**What:** Validation schemas shared between frontend form and backend API.
**When to use:** Demand creation, stage updates.

```typescript
// packages/shared/src/schemas/demand.ts
import { z } from "zod"

export const demandCreateSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
})

export const demandUpdateSchema = demandCreateSchema.partial().omit({ projectId: true })

export const demandStageUpdateSchema = z.object({
  stage: z.enum(["inbox", "discovery", "planning", "development", "testing", "merge", "done"]),
})

export type DemandCreate = z.infer<typeof demandCreateSchema>
export type DemandUpdate = z.infer<typeof demandUpdateSchema>
export type DemandStageUpdate = z.infer<typeof demandStageUpdateSchema>
```

### Anti-Patterns to Avoid

- **Using @dnd-kit/react (v0.2.x) in production:** Still pre-1.0 and experimental. Stick with stable @dnd-kit/core 6.3.x + @dnd-kit/sortable. The new API (DragDropProvider, simplified hooks) is not production-ready yet.
- **Polling without optimistic updates for drag-and-drop:** If you drag a card and wait 5 seconds for the next poll to confirm position, the UX feels broken. Always use optimistic updates via useMutation + onMutate for drag operations.
- **Fetching all demands without project filter:** The board shows demands for one project. Always filter by projectId in the API call and query key. Otherwise polling fetches unnecessary data.
- **Using refetchInterval without cancellation on unmount:** TanStack Query handles this automatically -- queries stop polling when components unmount. Do NOT implement manual setInterval.
- **Rendering useSortable component inside DragOverlay:** This causes ID collisions in dnd-kit. Create a separate presentational component for the overlay (Dice UI Kanban handles this automatically).
- **Storing board column state only on the client:** The source of truth is the demand's `stage` field in the database. Client state is a projection. Polling keeps it synchronized.
- **Not adding Demand to TENANT_MODELS:** If you forget to add "Demand" to the TENANT_MODELS array in `packages/database/src/tenant.ts`, tenant isolation breaks. Demands from other tenants would be visible.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Kanban drag-and-drop | Custom mouse/touch event handlers with position calculations | @dnd-kit/core + @dnd-kit/sortable (via Dice UI Kanban) | Touch support, keyboard accessibility, collision detection, DragOverlay, screen reader announcements -- hundreds of edge cases handled |
| Multi-container sortable | Custom state management for moving items between arrays | Dice UI Kanban `onValueChange` callback | Dice UI abstracts the complex container-swap logic. You get a simple `Record<ColumnId, Item[]>` state update. |
| Polling data refresh | Manual setInterval + fetch + setState | TanStack Query `refetchInterval: 5000` | Automatic cleanup on unmount, deduplication, background tab handling, cache management, error retry |
| Optimistic updates | Manual local state + API call + reconciliation | TanStack Query `useMutation` + `onMutate` + `onError` rollback | Handles race conditions, automatic rollback on error, cache consistency across multiple query consumers |
| Pipeline progress visualization | Custom SVG/canvas progress tracker | shadcn/ui Progress or custom step indicator with Tailwind | Accessible (ARIA), themeable, consistent with design system |
| Form validation (demand creation) | Custom validation logic with manual error state | Zod + react-hook-form + @hookform/resolvers | Single schema validates frontend form and backend API. Same pattern as Phase 1 project form. |

**Key insight:** The drag-and-drop Kanban board is deceptively complex. Touch handling, keyboard navigation, collision detection between overlapping containers, DragOverlay rendering, smooth animations, and accessibility announcements represent hundreds of edge cases. dnd-kit + Dice UI have solved all of them. The only custom logic needed is the state update callback and the API call.

## Common Pitfalls

### Pitfall 1: Polling Fights with Optimistic Updates

**What goes wrong:** User drags card from Inbox to Discovery. Optimistic update shows it in Discovery instantly. But the 5-second poll fires before the PATCH API response returns, fetching stale data showing the card still in Inbox. Card jumps back briefly.
**Why it happens:** Race condition between polling refetch and mutation response.
**How to avoid:** (1) In the `onMutate` callback, call `queryClient.cancelQueries({ queryKey: ["demands", projectId] })` to cancel any in-flight poll. (2) In `onSettled`, call `queryClient.invalidateQueries()` to trigger a fresh fetch after the mutation completes. TanStack Query handles the rest.
**Warning signs:** Cards flickering between columns, cards appearing in wrong column for a split second after drag.

### Pitfall 2: Empty Column Drop Targets

**What goes wrong:** User cannot drag a card into an empty column because there are no items to drop onto. The column itself is not a valid drop target.
**Why it happens:** SortableContext with an empty items array has no drop targets. Without a dedicated droppable zone for the empty column, dnd-kit cannot detect the drop.
**How to avoid:** Dice UI Kanban handles this by making each KanbanColumn itself a droppable zone (not just its items). If building manually, wrap each column with `useDroppable({ id: stage })` in addition to `SortableContext`.
**Warning signs:** Empty columns not accepting drops, cards "snapping back" when dropped on empty columns.

### Pitfall 3: DragOverlay ID Collision

**What goes wrong:** When dragging, the item appears duplicated or the wrong item renders in the overlay.
**Why it happens:** If you render the same useSortable component inside DragOverlay, two components share the same ID, confusing dnd-kit's internal tracking.
**How to avoid:** Dice UI Kanban handles this automatically. If building manually, render a separate presentational component (no hooks) inside DragOverlay.
**Warning signs:** Duplicate cards during drag, wrong card appearing as drag preview.

### Pitfall 4: Missing tenantId on Demand Model

**What goes wrong:** Demands are visible across tenants. User from Tenant A sees Tenant B's demands on the board.
**Why it happens:** Demand model has `tenantId` field but "Demand" is not in the TENANT_MODELS array in `packages/database/src/tenant.ts`. The forTenant() extension silently skips filtering.
**How to avoid:** IMMEDIATELY add "Demand" to TENANT_MODELS when adding the Demand model to schema. Write a test that creates demands in two tenants and verifies each tenant only sees their own.
**Warning signs:** Board shows demands from other organizations, demand count seems too high.

### Pitfall 5: Board Horizontal Overflow Without Scroll

**What goes wrong:** 7 columns don't fit on smaller screens. Board breaks layout or columns stack vertically, breaking the Kanban mental model.
**Why it happens:** CSS grid with 7 fixed columns overflows viewport. No horizontal scroll container.
**How to avoid:** Wrap KanbanBoard in a `ScrollArea` with `orientation="horizontal"`. Use `min-w-[200px]` per column and `overflow-x-auto` on the board container. The board should scroll horizontally, not wrap.
**Warning signs:** Columns stacking on top of each other, horizontal scrollbar on body instead of board container.

### Pitfall 6: Prisma Schema Migration Order

**What goes wrong:** Migration fails because Demand references Project via `projectId` foreign key, but the Project model doesn't have the `demands` relation field yet.
**Why it happens:** Prisma requires both sides of a relation to be defined in the same migration.
**How to avoid:** Add both the Demand model AND the `demands Demand[]` field to Project model in the same schema change before running `prisma migrate dev`.
**Warning signs:** Migration errors about foreign key constraints, "Unknown field" errors.

### Pitfall 7: Stale Project Selector on Demand Creation

**What goes wrong:** Demand creation form shows an outdated project list. User selects a project that was just archived.
**Why it happens:** Project list in demand form is not fetched from cache or uses a stale cache.
**How to avoid:** Use TanStack Query to fetch active projects with the same query key as the projects list page. Shared cache ensures consistency. Filter with `status: "active"` in the API.
**Warning signs:** Archived projects appearing in selector, 404 errors when creating demand for archived project.

## Code Examples

Verified patterns from official sources:

### TanStack Query Polling Configuration

```typescript
// Source: https://tanstack.com/query/v5/docs/framework/react/reference/useQuery
const { data } = useQuery({
  queryKey: ["demands", projectId],
  queryFn: () => api.get<Demand[]>(`/api/demands?projectId=${projectId}`),
  refetchInterval: 5000,              // BOARD-05: poll every 5 seconds
  refetchIntervalInBackground: false, // Stop polling when tab is not focused (saves resources)
})
```

### Optimistic Update with Rollback

```typescript
// Source: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
const moveCard = useMutation({
  mutationFn: (vars: { demandId: string; newStage: PipelineStage }) =>
    api.patch(`/api/demands/${vars.demandId}/stage`, { stage: vars.newStage }),
  onMutate: async ({ demandId, newStage }) => {
    // Cancel polling to prevent overwrite
    await queryClient.cancelQueries({ queryKey: ["demands", projectId] })
    // Snapshot current state for rollback
    const previous = queryClient.getQueryData<Demand[]>(["demands", projectId])
    // Optimistically update the cache
    queryClient.setQueryData<Demand[]>(["demands", projectId], (old = []) =>
      old.map((d) => (d.id === demandId ? { ...d, stage: newStage } : d))
    )
    return { previous }
  },
  onError: (_err, _vars, context) => {
    // Rollback on error
    if (context?.previous) {
      queryClient.setQueryData(["demands", projectId], context.previous)
    }
  },
  onSettled: () => {
    // Always refetch after mutation settles
    queryClient.invalidateQueries({ queryKey: ["demands", projectId] })
  },
})
```

### Dice UI Kanban Basic Setup

```typescript
// Source: https://www.diceui.com/docs/components/kanban
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem,
  KanbanOverlay,
} from "@/components/ui/kanban"

<Kanban
  value={columns}                        // Record<PipelineStage, Demand[]>
  onValueChange={setColumns}             // Called on every drag operation
  getItemValue={(item) => item.id}       // Extract unique ID from Demand
>
  <KanbanBoard className="grid auto-cols-[minmax(200px,1fr)] grid-flow-col gap-4">
    {PIPELINE_STAGES.map((stage) => (
      <KanbanColumn key={stage} value={stage}>
        {/* Column header */}
        <div className="flex items-center justify-between p-2 border-b">
          <h3 className="text-sm font-semibold capitalize">{stage}</h3>
          <Badge variant="secondary">{columns[stage]?.length ?? 0}</Badge>
        </div>
        {/* Items */}
        <div className="flex flex-col gap-2 p-2">
          {(columns[stage] ?? []).map((demand) => (
            <KanbanItem key={demand.id} value={demand.id} asHandle>
              <DemandCard demand={demand} />
            </KanbanItem>
          ))}
        </div>
      </KanbanColumn>
    ))}
  </KanbanBoard>
  <KanbanOverlay>
    {({ value, variant }) =>
      variant === "item" ? (
        <DemandCard demand={demands.find((d) => d.id === value)!} />
      ) : null
    }
  </KanbanOverlay>
</Kanban>
```

### Fastify Demand Routes Registration

```typescript
// apps/api/src/server.ts (additions to existing protected scope)
import demandRoutes from "./routes/demands.js"

// Inside the existing protected scope:
await app.register(async (protectedApp) => {
  await protectedApp.register(authPlugin)
  await protectedApp.register(tenantPlugin)
  await protectedApp.register(projectRoutes, { prefix: "/api/projects" })
  await protectedApp.register(demandRoutes, { prefix: "/api/demands" })  // NEW
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit/core + @dnd-kit/sortable | 2023 (react-beautiful-dnd deprecated by Atlassian) | dnd-kit is the ecosystem standard. react-beautiful-dnd is not maintained. |
| @hello-pangea/dnd (fork of react-beautiful-dnd) | @dnd-kit/core | 2024-2025 | Pangea is a community fork. dnd-kit has better API, TS support, and performance. |
| @dnd-kit/core 6.x (stable) | @dnd-kit/react 0.2.x (experimental rewrite) | In progress (pre-1.0) | New API with DragDropProvider, simplified hooks. NOT ready for production. Use 6.x stable. |
| Manual setInterval polling | TanStack Query refetchInterval | TanStack Query v4+ (2022) | Built-in polling with cache management, dedup, background tab handling. |
| Manual drag-and-drop Kanban | Dice UI Kanban component | 2025 (Dice UI release) | Pre-built shadcn/ui compatible Kanban with dnd-kit, accessibility, and keyboard nav. |

**Deprecated/outdated:**
- **react-beautiful-dnd:** Deprecated by Atlassian. Do not use.
- **react-dnd:** Still maintained but more complex API. dnd-kit is preferred for new React projects.
- **@dnd-kit/react 0.2.x:** Experimental. Do not use in production yet. Monitor for 1.0 release.
- **Manual fetch + setInterval:** Use TanStack Query's refetchInterval instead.

## Open Questions

1. **Dice UI Kanban registry installation on Windows**
   - What we know: Dice UI Kanban installs via `npx shadcn@latest add "https://diceui.com/r/kanban"`. This should copy the component files into the project.
   - What's unclear: Whether the registry URL works on Windows with the project's existing shadcn/ui configuration. The components.json was set up in Phase 1.
   - Recommendation: Try the registry install first. If it fails, manually install dnd-kit packages and copy the Kanban component source from Dice UI GitHub (MIT license).

2. **Demand creation UX: Modal/Sheet vs Full Page**
   - What we know: DEM-01 and DEM-02 require title, description, priority, and project selection. This is a simple form (4 fields).
   - What's unclear: Whether a Dialog/Sheet is better UX than a dedicated page for demand creation.
   - Recommendation: Use a Sheet (side panel) triggered by a "New Demand" button on the board. This keeps the board visible while creating a demand. If the user arrives from a non-board context, fall back to a full page at `/demands/new`.

3. **Board route structure: nested under project or standalone**
   - What we know: The board shows demands for one project. The URL needs to include projectId.
   - What's unclear: Whether to use `/projects/[projectId]/board` (nested) or `/board?projectId=xxx` (flat).
   - Recommendation: Use `/projects/[projectId]/board` (nested route). This is more RESTful, makes breadcrumbs natural (Projects > My Project > Board), and the projectId is in the URL path rather than a query param.

4. **Card ordering within columns**
   - What we know: @dnd-kit/sortable supports reordering items within a column. The design doc mentions drag-and-drop between columns.
   - What's unclear: Whether card ordering within a column needs to be persisted (requires an `order` or `position` field on Demand) or if default ordering by createdAt is sufficient for v1.
   - Recommendation: For v1, order by `createdAt` ascending within each column. Do not add a position/order field yet. This simplifies the schema and API. If reordering within columns becomes a requirement, add a `sortOrder` integer field later.

## Sources

### Primary (HIGH confidence)
- dnd-kit official docs (DndContext, Sortable preset, collision detection): https://docs.dndkit.com
- dnd-kit Sortable multi-container pattern: https://docs.dndkit.com/presets/sortable
- Dice UI Kanban component API and examples: https://www.diceui.com/docs/components/kanban
- TanStack Query v5 useQuery reference (refetchInterval): https://tanstack.com/query/v5/docs/framework/react/reference/useQuery
- TanStack Query optimistic updates guide: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
- dnd-kit migration guide (next version): https://next.dndkit.com/react/guides/migration

### Secondary (MEDIUM confidence)
- Kanban board with dnd-kit, Tailwind, and shadcn/ui (GitHub example): https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui
- Building a Kanban board with shadcn (Marmelab, Jan 2026): https://marmelab.com/blog/2026/01/15/building-a-kanban-board-with-shadcn.html
- dnd-kit Kanban implementation in Next.js: https://docs.desishub.com/programming-tutorials/nextjs/kanban
- TanStack Query polling mastery article: https://medium.com/@soodakriti45/tanstack-query-mastering-polling-ee11dc3625cb
- dnd-kit future/maintenance status (GitHub issue #1194): https://github.com/clauderic/dnd-kit/issues/1194
- shadcn-kanban-board (zero-dep alternative): https://github.com/janhesters/shadcn-kanban-board

### Tertiary (LOW confidence)
- @dnd-kit/core npm version (6.3.1, published ~1 year ago): https://www.npmjs.com/package/@dnd-kit/core -- needs validation that this is truly the latest
- @dnd-kit/sortable npm version (10.0.0): https://www.npmjs.com/package/@dnd-kit/sortable -- version jump from core 6.x to sortable 10.x is unusual, needs validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @dnd-kit is the established React DnD library (design doc specifies it). Dice UI Kanban is well-documented with clear API. TanStack Query polling is a documented core feature.
- Architecture: HIGH - Patterns derived from Phase 1 codebase (same Fastify routes, TanStack Query, Prisma schema, tenant isolation). Kanban patterns verified from official dnd-kit docs + Dice UI docs.
- Pitfalls: HIGH - Polling-vs-optimistic-update race condition is a well-known TanStack Query pattern. Empty column drop targets documented in dnd-kit docs. Tenant isolation pitfall is a Phase 1 established concern.
- Prisma schema: HIGH - Demand model follows exact same pattern as Project model. Enums match design doc. Foreign key relations are standard Prisma.

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (30 days -- stable technologies, dnd-kit mature, TanStack Query stable)
