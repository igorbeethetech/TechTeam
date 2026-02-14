# Phase 7: Sidebar Navigation and Boards - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current top header navigation with a collapsible sidebar. Add a dedicated "Boards" page for project selection. Make demand cards on the Kanban board clickable for detail navigation while preserving drag-and-drop via separate drag handles. Improve responsiveness for mobile/tablet.

</domain>

<decisions>
## Implementation Decisions

### Sidebar Style
- Claude's discretion on visual style — choose what works best with shadcn/ui design system
- Tooltip on hover when collapsed (not expand-on-hover)
- Project list always visible in sidebar (not in a submenu), with direct links to each project's board
- User info (email) + logout button fixed in sidebar footer, Jira/Slack style
- Sidebar serves as project switcher — clicking a project in sidebar navigates directly to its board

### Boards Page
- Grid of cards layout for project listing
- Each card shows: project name + demand count per status (e.g., 3 em Discovery, 2 em Development)
- Clicking a card navigates to that project's Kanban board
- Only active (non-archived) projects shown — no archived projects on Boards page
- No need for dropdown/switcher on board page — sidebar already provides project switching

### Card Interaction
- Claude's discretion on drag handle implementation (grip icon lateral, header area, or other approach)
- Hover highlight effect on cards (border or shadow) indicating clickability, then navigate on click
- Remove the external link icon currently on cards — card itself is clickable, icon becomes redundant
- Click navigates to /demands/:id in same tab

### Responsiveness and Mobile
- Hamburger button + overlay sidebar on mobile (sidebar hidden by default on small screens)
- Kanban board uses horizontal scroll on mobile (swipe between columns)
- Drag-and-drop works on mobile via long press (300ms+ activates drag, normal tap navigates to detail)

### Claude's Discretion
- Exact sidebar visual style (colors, width, spacing) — work with shadcn/ui patterns
- Drag handle implementation approach (grip icon, header drag, or delay-based)
- Exact spacing, typography, and animation details
- Breakpoint values for mobile/desktop switching
- Loading and empty states

</decisions>

<specifics>
## Specific Ideas

- Projects in sidebar as quick project switcher — user clicks project name to go straight to its board without visiting Boards page
- Cards grid on Boards page should feel informative at a glance — project name + demand counts give instant status overview
- Mobile drag with long press should feel natural — 300ms is similar to iOS/Android native behavior

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-sidebar-navigation*
*Context gathered: 2026-02-13*
