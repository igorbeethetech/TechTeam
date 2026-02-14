# Phase 7: Sidebar Navigation and Boards - Research

**Researched:** 2026-02-14
**Domain:** React sidebar navigation, dnd-kit drag handles, responsive layout
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Sidebar Style
- Claude's discretion on visual style -- choose what works best with shadcn/ui design system
- Tooltip on hover when collapsed (not expand-on-hover)
- Project list always visible in sidebar (not in a submenu), with direct links to each project's board
- User info (email) + logout button fixed in sidebar footer, Jira/Slack style
- Sidebar serves as project switcher -- clicking a project in sidebar navigates directly to its board

#### Boards Page
- Grid of cards layout for project listing
- Each card shows: project name + demand count per status (e.g., 3 em Discovery, 2 em Development)
- Clicking a card navigates to that project's Kanban board
- Only active (non-archived) projects shown -- no archived projects on Boards page
- No need for dropdown/switcher on board page -- sidebar already provides project switching

#### Card Interaction
- Claude's discretion on drag handle implementation (grip icon lateral, header area, or other approach)
- Hover highlight effect on cards (border or shadow) indicating clickability, then navigate on click
- Remove the external link icon currently on cards -- card itself is clickable, icon becomes redundant
- Click navigates to /demands/:id in same tab

#### Responsiveness and Mobile
- Hamburger button + overlay sidebar on mobile (sidebar hidden by default on small screens)
- Kanban board uses horizontal scroll on mobile (swipe between columns)
- Drag-and-drop works on mobile via long press (300ms+ activates drag, normal tap navigates to detail)

### Claude's Discretion
- Exact sidebar visual style (colors, width, spacing) -- work with shadcn/ui patterns
- Drag handle implementation approach (grip icon, header drag, or delay-based)
- Exact spacing, typography, and animation details
- Breakpoint values for mobile/desktop switching
- Loading and empty states

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

## Summary

This phase replaces the current top header navigation (a `<header>` bar with inline `<nav>` links in `apps/web/src/app/(dashboard)/layout.tsx`) with the official shadcn/ui Sidebar component. The project already has sidebar CSS variables defined in `globals.css` (--sidebar-background, --sidebar-foreground, etc.) and uses shadcn/ui `new-york` style with `radix-ui` v1.4.3, but the Sidebar component itself has **not been installed yet**. The first step is `npx shadcn@latest add sidebar` which will create `components/ui/sidebar.tsx`.

The Kanban board currently uses `@dnd-kit/core` v6.3.1 + `@dnd-kit/sortable` v10.0.0 with a custom `kanban.tsx` component. Demand cards use `asHandle` mode on `KanbanItem`, which makes the entire card a drag handle and prevents click navigation. The core change is switching from `asHandle` to a separate drag handle element using `useSortable`'s `setActivatorNodeRef` + `listeners`, freeing the card body for click-to-navigate. Mobile drag requires adding a `TouchSensor` with 300ms delay alongside the existing `PointerSensor`.

A new Boards page (`/boards`) needs a new API endpoint to fetch projects with demand counts per stage, since the existing `GET /api/projects` only returns project metadata without demand statistics.

**Primary recommendation:** Use the official shadcn/ui Sidebar component with `collapsible="icon"` mode, GripVertical drag handles on demand cards, and `TouchSensor` with 300ms delay for mobile long-press drag.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui sidebar | (generated) | Collapsible sidebar with icon mode | Official shadcn/ui component, uses existing CSS vars, cookie persistence built-in |
| @dnd-kit/core | ^6.3.1 | Drag-and-drop engine | Already installed, TouchSensor for mobile |
| @dnd-kit/sortable | ^10.0.0 | Sortable kanban items | Already installed, `setActivatorNodeRef` for drag handles |
| lucide-react | ^0.563.0 | Icons (GripVertical, LayoutDashboard, Kanban, etc.) | Already installed, standard icon library |
| radix-ui | ^1.4.3 | Tooltip, ScrollArea primitives | Already installed, shadcn/ui foundation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | ^5.90.0 | Data fetching for projects/demands | Already used throughout, use for Boards page data |
| next/navigation | (Next 15.3) | useRouter, usePathname, Link | Already used, for sidebar active state detection |
| sonner | ^2.0.7 | Toast notifications | Already installed, for error feedback |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui Sidebar | Custom sidebar from scratch | Don't -- shadcn sidebar handles collapse, mobile sheet, tooltips, persistence, accessibility out of the box |
| Cookie persistence | localStorage | Cookies avoid SSR hydration mismatch; shadcn sidebar uses cookies by default |
| GripVertical drag handle | Delay-based drag (no handle) | Grip icon is more discoverable; delay-based requires 300ms wait even on desktop |

**Installation:**
```bash
cd apps/web && npx shadcn@latest add sidebar
```

This generates `components/ui/sidebar.tsx` with all sub-components. No additional npm packages needed -- shadcn sidebar uses the already-installed `radix-ui` and `lucide-react`.

## Architecture Patterns

### Current Dashboard Layout Structure
```
apps/web/src/
  app/
    (dashboard)/
      layout.tsx          # <-- Currently: header nav. REPLACE with sidebar layout
      page.tsx            # Dashboard home
      projects/
        page.tsx          # Project list
        new/page.tsx      # New project form
        [projectId]/
          board/page.tsx  # Kanban board
          edit/page.tsx   # Edit project
      demands/
        [demandId]/page.tsx  # Demand detail
      metrics/page.tsx    # Metrics
      settings/page.tsx   # Settings
      boards/page.tsx     # <-- NEW: Boards overview page
```

### Recommended New Component Structure
```
apps/web/src/
  components/
    ui/
      sidebar.tsx         # <-- NEW: Generated by shadcn CLI
    layout/
      app-sidebar.tsx     # <-- NEW: Main sidebar composition
      sidebar-nav.tsx     # <-- NEW: Navigation items
      sidebar-projects.tsx # <-- NEW: Project list in sidebar
      sidebar-footer.tsx  # <-- NEW: User info + logout
    board/
      demand-card.tsx     # <-- MODIFY: Add drag handle, make clickable
      kanban-board.tsx    # <-- MODIFY: Add TouchSensor, remove asHandle
      kanban.tsx          # <-- MODIFY in ui/: Support separate handle ref
    boards/
      boards-grid.tsx     # <-- NEW: Project cards grid for /boards page
      board-card.tsx      # <-- NEW: Individual board card with demand counts
  hooks/
    use-sidebar-state.ts  # <-- OPTIONAL: If custom state management needed
```

### Pattern 1: shadcn/ui Sidebar Layout Integration
**What:** Replace header nav with SidebarProvider + Sidebar in the dashboard layout
**When to use:** The `(dashboard)/layout.tsx` file, which wraps ALL authenticated pages
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/radix/sidebar
// apps/web/src/app/(dashboard)/layout.tsx

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Auth checks remain the same...
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-6">
          <SidebarTrigger />
          {/* NotificationBell moves here */}
        </header>
        <main className="p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

### Pattern 2: Sidebar with Icon-Only Collapse + Tooltips
**What:** Sidebar collapses to icon-only mode with tooltips showing item labels
**When to use:** All nav items in the sidebar
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/radix/sidebar
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// When sidebar collapses, items use group-data-[collapsible=icon]:hidden
// to hide text labels. Tooltips show on hover via the Tooltip component.
function NavItem({ icon: Icon, label, href, isActive }: NavItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <Link href={href}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
```

### Pattern 3: Separate Drag Handle on Demand Cards
**What:** GripVertical icon as explicit drag handle, card body clickable for navigation
**When to use:** Every demand card in the Kanban board
**Example:**
```typescript
// Source: https://docs.dndkit.com/presets/sortable/usesortable
import { useSortable } from "@dnd-kit/sortable"
import { GripVertical } from "lucide-react"

function DraggableDemandCard({ demand }: { demand: DemandItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: demand.id })

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <Link href={`/demands/${demand.id}`} className="block">
        <div className="rounded-lg border bg-card p-3 shadow-sm hover:border-primary/50 hover:shadow-md transition-all">
          <div className="flex items-start gap-2">
            {/* Drag handle - only this is draggable */}
            <button
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
              onClick={(e) => e.preventDefault()}
            >
              <GripVertical className="size-4" />
            </button>
            {/* Card content - clickable for navigation */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium line-clamp-2">{demand.title}</p>
              {/* ... priority badge, cost, etc. */}
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}
```

### Pattern 4: Mobile Touch Sensor with Long Press
**What:** Add TouchSensor with 300ms delay for mobile drag, keep PointerSensor for desktop
**When to use:** In the Kanban root component (kanban.tsx)
**Example:**
```typescript
// Source: https://docs.dndkit.com/api-documentation/sensors/touch
import {
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }),
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 300,
      tolerance: 5,
    },
  }),
  useSensor(KeyboardSensor)
)
```

### Pattern 5: Sidebar Collapse State Persistence
**What:** shadcn sidebar persists collapse state via cookies automatically
**When to use:** Built into SidebarProvider -- works automatically
**Details:** The SidebarProvider stores state in a cookie named `sidebar:state` with a 7-day max-age. On navigation, the layout reads this cookie. For the dashboard layout being `"use client"`, the `defaultOpen={true}` prop sets the initial state, and subsequent state changes are persisted. The `useSidebar()` hook provides `state`, `open`, `toggleSidebar`, `isMobile`, etc.

### Anti-Patterns to Avoid
- **Putting SidebarProvider outside the auth check:** SidebarProvider must be inside the authenticated section, after session is verified. Do not wrap the entire root layout.
- **Using expand-on-hover for collapsed sidebar:** User explicitly rejected this. Use tooltip-on-hover with `collapsible="icon"` mode instead.
- **Fetching all demands for the Boards page:** The Boards page needs demand *counts* per status, not full demand lists. Create a dedicated API endpoint that uses `groupBy` or `count` queries.
- **Making the entire card a Link and the drag handle a nested interactive element:** This causes HTML nesting issues (`<a>` inside `<button>`). Instead, use `onClick` with `router.push()` on the card, or wrap the Link outside the sortable div.
- **Removing PointerSensor when adding TouchSensor:** Both sensors must be present. PointerSensor handles mouse/trackpad; TouchSensor handles touch. They work together via `useSensors`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible sidebar | Custom sidebar with manual state, animation, mobile sheet | shadcn/ui Sidebar (`npx shadcn@latest add sidebar`) | Handles collapse/expand animation, icon mode, mobile sheet overlay, keyboard shortcut (Cmd+B), cookie persistence, tooltips, accessibility |
| Sidebar collapse persistence | Custom localStorage/cookie solution | Built-in SidebarProvider cookie persistence | Already handles cookie serialization, 7-day expiry, SSR compatibility |
| Mobile sidebar overlay | Custom Sheet + state management | shadcn Sidebar mobile mode | SidebarProvider auto-detects mobile via `isMobile` hook, shows Sheet overlay |
| Tooltip on collapsed items | Custom tooltip logic | shadcn SidebarMenuButton `tooltip` prop | Built-in tooltip support that only shows when sidebar is collapsed |
| Touch-friendly drag-and-drop | Custom touch event handlers | @dnd-kit TouchSensor with delay constraint | Handles touch events, long press detection, tolerance for finger imprecision, works with existing dnd-kit setup |

**Key insight:** The shadcn/ui Sidebar component is specifically designed for this exact use case (Jira/Slack-style navigation). It handles the hardest parts (animation, mobile responsive, state persistence, accessibility) and provides the exact collapsible="icon" mode the user wants. Building a custom sidebar would require reimplementing all of this.

## Common Pitfalls

### Pitfall 1: Nested Interactive Elements in Drag Cards
**What goes wrong:** Wrapping a `<Link>` around a sortable card that contains a drag handle `<button>` creates invalid HTML (interactive element nesting) and confuses screen readers.
**Why it happens:** Natural instinct is to make the card a `<Link>` and add a drag handle button inside it.
**How to avoid:** Use `onClick` + `router.push()` on the card div instead of `<Link>`, or place the `<Link>` only on the text content, not wrapping the drag handle. Alternatively, use an event handler that calls `router.push()` on the card container and `e.preventDefault()` on the drag handle.
**Warning signs:** Console warnings about nested `<a>` and `<button>` elements, drag not initiating on the handle.

### Pitfall 2: SidebarProvider Placement and Auth State
**What goes wrong:** SidebarProvider renders before auth check completes, causing layout shift or flash of sidebar before redirect.
**Why it happens:** The current `(dashboard)/layout.tsx` checks auth and redirects if not logged in. If SidebarProvider wraps the auth check, the sidebar briefly renders then disappears.
**How to avoid:** Keep the auth check pattern (isPending -> loading state, !session -> null). Only render SidebarProvider + Sidebar after session is confirmed.
**Warning signs:** Flash of sidebar on login page redirect, hydration errors.

### Pitfall 3: Kanban Card Click Firing During Drag
**What goes wrong:** User drags a card, and when they release, a click event fires and navigates to the demand detail page.
**Why it happens:** Mouse down + mouse up = click, even after a drag. With the current `asHandle` on the entire card, this is masked, but with separate handles, the card body gets click events.
**How to avoid:** The `PointerSensor` with `activationConstraint: { distance: 5 }` already prevents this for drag handles. For the card body, the click handler should check if a drag just occurred (use a ref to track `isDragging` state from `useSortable`). Alternatively, since the drag handle is separate, clicks on the card body (non-handle area) should navigate normally because dnd-kit events only fire on the handle.
**Warning signs:** Navigating to demand detail after every drag operation.

### Pitfall 4: Missing touch-action CSS on Drag Handles
**What goes wrong:** On mobile, the browser's default touch behaviors (scroll, zoom) interfere with drag operations on the handle.
**Why it happens:** Without `touch-action: none` on the drag handle, the browser intercepts touch events.
**How to avoid:** Add `touch-none` (Tailwind class for `touch-action: none`) to the drag handle element. This is already shown in the code example above.
**Warning signs:** Drag not starting on mobile, page scrolling instead of dragging.

### Pitfall 5: Boards Page N+1 Query Problem
**What goes wrong:** Fetching demand counts per project by loading all demands for each project separately causes N+1 API calls.
**Why it happens:** The existing `/api/demands?projectId=X` endpoint returns all demands for one project. Calling it N times for N projects is wasteful.
**How to avoid:** Create a dedicated API endpoint (e.g., `GET /api/projects/boards` or `GET /api/projects?withDemandCounts=true`) that uses Prisma `groupBy` to get demand counts per stage per project in a single query.
**Warning signs:** Boards page loading slowly, many parallel API calls in the network tab.

### Pitfall 6: Sidebar Project List Not Updating
**What goes wrong:** Project list in sidebar shows stale data after creating/archiving a project on the Projects page.
**Why it happens:** Sidebar and Projects page use separate React Query instances. If the sidebar caches projects independently, mutations on the Projects page don't invalidate the sidebar's cache.
**How to avoid:** Use the same query key (`["projects"]`) for both the sidebar project list and the Projects page list. When a project is created/archived/deleted, `queryClient.invalidateQueries({ queryKey: ["projects"] })` will refresh both.
**Warning signs:** New project appears on Projects page but not in sidebar until page refresh.

### Pitfall 7: Mobile Sidebar Not Closing on Navigation
**What goes wrong:** User taps a sidebar link on mobile, navigates to new page, but the overlay sidebar stays open.
**Why it happens:** The mobile sidebar uses Sheet/Dialog overlay. Page navigation in Next.js doesn't automatically close it.
**How to avoid:** In the sidebar navigation component, use `setOpenMobile(false)` from the `useSidebar()` hook when a link is clicked, or listen to `pathname` changes via `usePathname()` and close the mobile sidebar on change.
**Warning signs:** Overlay sidebar blocking content after navigation on mobile.

## Code Examples

Verified patterns from official sources:

### shadcn/ui Sidebar Installation and Basic Structure
```bash
# Source: https://ui.shadcn.com/docs/components/radix/sidebar
cd apps/web
npx shadcn@latest add sidebar
```

### App Sidebar Composition
```typescript
// Source: https://ui.shadcn.com/docs/components/radix/sidebar
// components/layout/app-sidebar.tsx
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard,
  Kanban,
  FolderOpen,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react"

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Boards", href: "/boards", icon: Kanban },
  { label: "Projects", href: "/projects", icon: FolderOpen },
  { label: "Metrics", href: "/metrics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  // Projects fetched with same query key as ProjectList
  const { data } = useQuery({ queryKey: ["projects"], queryFn: ... })

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <span className="font-semibold">TechTeam</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Project switcher */}
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === `/projects/${project.id}/board`}
                    tooltip={project.name}
                  >
                    <Link href={`/projects/${project.id}/board`}>
                      <Kanban />
                      <span>{project.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {/* User email + logout */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={session.user.email}>
              <span className="truncate text-sm">{session.user.email}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Logout">
              <LogOut />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
```

### Modified KanbanItem with Separate Drag Handle Support
```typescript
// Source: https://docs.dndkit.com/presets/sortable/usesortable
// Modify components/ui/kanban.tsx KanbanItem

interface KanbanItemProps {
  value: UniqueIdentifier
  children: React.ReactNode
  asHandle?: boolean    // Keep for backward compat but deprecate
  className?: string
  asChild?: boolean
}

// The KanbanItem now exposes setActivatorNodeRef via context or render prop
// so DemandCard can attach its own drag handle
function KanbanItem({
  value,
  children,
  asHandle = false,
  className,
  asChild = false,
}: KanbanItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: value })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // When asHandle=true (legacy), entire item is draggable
  // When asHandle=false (new), only the element using setActivatorNodeRef is draggable
  const dragProps = asHandle ? { ...attributes, ...listeners } : {}

  const Comp = asChild ? Slot : "div"

  return (
    <KanbanItemContext.Provider value={{ listeners, attributes, setActivatorNodeRef }}>
      <Comp ref={setNodeRef} style={style} className={cn(className)} {...dragProps}>
        {children}
      </Comp>
    </KanbanItemContext.Provider>
  )
}

// New context to expose drag handle props to children
const KanbanItemContext = React.createContext<{
  listeners: Record<string, Function> | undefined
  attributes: Record<string, unknown> | undefined
  setActivatorNodeRef: (node: HTMLElement | null) => void
}>({
  listeners: undefined,
  attributes: undefined,
  setActivatorNodeRef: () => {},
})

export function useKanbanItemHandle() {
  return React.useContext(KanbanItemContext)
}
```

### Demand Card with Drag Handle and Click Navigation
```typescript
// components/board/demand-card.tsx
import { useRouter } from "next/navigation"
import { GripVertical } from "lucide-react"
import { useKanbanItemHandle } from "@/components/ui/kanban"

export function DemandCard({ demand }: DemandCardProps) {
  const router = useRouter()
  const { listeners, attributes, setActivatorNodeRef } = useKanbanItemHandle()

  return (
    <div
      className="rounded-lg border bg-card p-3 shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
      onClick={() => router.push(`/demands/${demand.id}`)}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </button>
        {/* Card content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium line-clamp-2">{demand.title}</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge className={PRIORITY_COLORS[demand.priority]}>
              {demand.priority}
            </Badge>
            {demand.totalCostUsd > 0 && (
              <span className="text-xs text-muted-foreground">
                ${demand.totalCostUsd.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

### Boards Page API Endpoint (Backend)
```typescript
// apps/api/src/routes/projects.ts - New endpoint

// GET /boards - List active projects with demand counts per stage
fastify.get("/boards", async (request: FastifyRequest, reply: FastifyReply) => {
  const projects = await request.prisma.project.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
  })

  // Get demand counts grouped by projectId and stage
  const demandCounts = await request.prisma.demand.groupBy({
    by: ["projectId", "stage"],
    _count: { id: true },
    where: {
      projectId: { in: projects.map((p) => p.id) },
    },
  })

  // Build response with counts per project
  const projectBoards = projects.map((project) => ({
    ...project,
    demandCounts: Object.fromEntries(
      demandCounts
        .filter((dc) => dc.projectId === project.id)
        .map((dc) => [dc.stage, dc._count.id])
    ),
  }))

  return { projects: projectBoards }
})
```

### Boards Page Frontend Component
```typescript
// components/boards/boards-grid.tsx
import { PIPELINE_STAGES, STAGE_LABELS } from "@techteam/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function BoardCard({ project }: { project: ProjectWithCounts }) {
  return (
    <Link href={`/projects/${project.id}/board`}>
      <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer">
        <CardHeader>
          <CardTitle>{project.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PIPELINE_STAGES.filter((s) => (project.demandCounts[s] ?? 0) > 0).map((stage) => (
              <Badge key={stage} variant="secondary">
                {project.demandCounts[stage]} {STAGE_LABELS[stage]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
```

### Mobile Sidebar Toggle
```typescript
// The shadcn Sidebar handles mobile automatically:
// - On screens < md (768px by default), sidebar renders as Sheet overlay
// - SidebarTrigger becomes a hamburger menu button
// - useSidebar().isMobile detects the breakpoint

// To close sidebar on mobile navigation:
function SidebarNavItem({ href, icon: Icon, label }: NavItemProps) {
  const { setOpenMobile } = useSidebar()
  const pathname = usePathname()

  return (
    <SidebarMenuButton
      asChild
      isActive={pathname === href}
      tooltip={label}
      onClick={() => setOpenMobile(false)}
    >
      <Link href={href}>
        <Icon />
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom sidebar with CSS transitions | shadcn/ui Sidebar component | Oct 2024 (shadcn sidebar release) | Full-featured sidebar with icon collapse, mobile sheet, cookie persistence, accessibility |
| dnd-kit entire-card-as-handle | Separate drag handle with setActivatorNodeRef | Available since dnd-kit v6 | Enables click-to-navigate on card body while preserving drag on handle |
| PointerSensor only | PointerSensor + TouchSensor | Available since dnd-kit v6 | Proper mobile touch support with configurable long-press delay |
| Header nav with inline links | Sidebar navigation with project switcher | This phase | Scales better with more nav items, provides persistent project context |

**Deprecated/outdated:**
- The current `asHandle` approach on KanbanItem makes the entire card a drag target, preventing click navigation. This must be replaced with separate drag handles.
- The `ExternalLink` icon on demand cards is explicitly marked for removal by the user.

## Open Questions

1. **Boards page API endpoint placement**
   - What we know: The existing `GET /api/projects` returns only active projects without demand statistics. A new endpoint is needed for `demandCounts` per stage.
   - What's unclear: Whether this should be a new route (`/api/projects/boards`) or an optional query parameter on the existing route (`/api/projects?withCounts=true`).
   - Recommendation: Use a separate route `GET /api/projects/boards` to avoid coupling. The existing `/api/projects` endpoint is used throughout the app and adding optional parameters complicates it.

2. **KanbanItem refactoring approach**
   - What we know: The current `kanban.tsx` has `asHandle` as a boolean prop. We need to add context-based handle support.
   - What's unclear: Whether to keep backward compatibility with `asHandle` or just refactor all usages.
   - Recommendation: Remove `asHandle` usage entirely since the only consumer is `kanban-board.tsx`. Simpler than maintaining two code paths. Expose handle props via context (as shown in code examples).

3. **shadcn Sidebar cookie persistence bug**
   - What we know: There is a reported bug (Sep 2025, GitHub issue #8176) where collapsible sidebar does not respect cookie value on page reload and uses `defaultOpen` instead.
   - What's unclear: Whether this bug has been fixed in the current shadcn version.
   - Recommendation: Verify after installation. If the bug persists, add a `useEffect` that reads the cookie and calls `setOpen()` on mount as a workaround. Alternatively, use `localStorage` as fallback persistence.

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Sidebar docs](https://ui.shadcn.com/docs/components/radix/sidebar) - Full API reference, props, layout patterns, mobile behavior
- [dnd-kit Touch Sensor docs](https://docs.dndkit.com/api-documentation/sensors/touch) - Delay activation constraint, tolerance, CSS recommendations
- [dnd-kit useSortable docs](https://docs.dndkit.com/presets/sortable/usesortable) - setActivatorNodeRef for separate drag handles
- [dnd-kit Sensors overview](https://docs.dndkit.com/api-documentation/sensors) - useSensors with multiple sensor types
- Codebase inspection - Current `layout.tsx`, `kanban.tsx`, `kanban-board.tsx`, `demand-card.tsx`, `globals.css`, `package.json` (all verified directly)

### Secondary (MEDIUM confidence)
- [shadcn/ui Sidebar blocks](https://ui.shadcn.com/blocks/sidebar) - Example compositions and patterns
- [lucide-react GripVertical](https://lucide.dev/icons/grip-vertical) - Drag handle icon availability
- [shadcn/ui GitHub issues](https://github.com/shadcn-ui/ui/issues/8176) - Cookie persistence bug report

### Tertiary (LOW confidence)
- Community patterns for closing mobile sidebar on navigation (multiple sources agree, not officially documented)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed except sidebar component (which is generated, not npm-installed). Versions verified from package.json.
- Architecture: HIGH - Based on direct codebase inspection of current layout, dnd-kit patterns verified from official docs.
- Pitfalls: HIGH - Nested interactive elements and click-during-drag are well-documented dnd-kit patterns. Sidebar auth placement derived from reading current layout code.
- API endpoint: MEDIUM - Prisma groupBy usage is standard, but exact endpoint shape is a recommendation.
- Cookie persistence bug: LOW - Reported in Sep 2025, unclear if fixed.

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days - stable ecosystem, all libraries already in use)
