---
phase: 02-kanban-demands
plan: 02
subsystem: demands-ui
tags: [demand-form, demand-detail, pipeline-progress, sheet-panel, react-hook-form, zod-validation, shadcn-sheet, shadcn-progress]

# Dependency graph
requires:
  - phase: 02-01
    provides: Demand model, CRUD API, Kanban board with drag-and-drop, demandCreateSchema, PIPELINE_STAGES, STAGE_LABELS, DemandCard, BoardHeader, board page
provides:
  - Demand creation form (DemandForm) with react-hook-form + zod validation, project pre-selection, priority dropdown
  - Sheet side panel on board page for creating demands without leaving the board
  - Demand detail page at /demands/[demandId] with loading/error states
  - Pipeline progress bar (PipelineProgress) visualizing 7 stages with current stage highlighted
  - DemandDetail component with title, metadata, description, cost, and progressive disclosure for future-phase fields
  - Clickable detail link on demand cards (ExternalLink icon) without interfering with drag-and-drop
  - shadcn Sheet and Progress components installed
affects: [03-agent-pipeline, 04-dev-testing, 05-merge-concurrency]

# Tech tracking
tech-stack:
  added: ["shadcn sheet", "shadcn progress"]
  patterns: [sheet-form-pattern, pipeline-progress-visualization, detail-link-on-drag-card, progressive-disclosure-for-future-fields]

key-files:
  created:
    - apps/web/src/components/demands/demand-form.tsx
    - apps/web/src/components/demands/demand-detail.tsx
    - apps/web/src/components/demands/pipeline-progress.tsx
    - apps/web/src/app/(dashboard)/demands/[demandId]/page.tsx
    - apps/web/src/components/ui/sheet.tsx
    - apps/web/src/components/ui/progress.tsx
  modified:
    - apps/web/src/components/board/board-header.tsx
    - apps/web/src/app/(dashboard)/projects/[projectId]/board/page.tsx
    - apps/web/src/components/board/demand-card.tsx

key-decisions:
  - "Sheet side panel for demand creation keeps board visible while creating -- better UX than navigating away"
  - "ExternalLink icon in card instead of wrapping entire card in Link -- avoids drag-and-drop click conflicts with stopPropagation"
  - "Ternary expressions for unknown-typed fields (requirements, plan) to satisfy ReactNode type constraints in strict TypeScript"
  - "Progressive disclosure pattern for future-phase fields -- only shown when populated, ready for Discovery/Planning/Dev agents"

patterns-established:
  - "Sheet form pattern: controlled open state on parent, onSuccess callback closes sheet + invalidates queries"
  - "Pipeline progress bar: PIPELINE_STAGES.map with currentIndex comparison for completed/current/future styling"
  - "Drag-safe card links: onClick + onPointerDown stopPropagation on link elements inside draggable cards"
  - "Progressive disclosure: future-phase demand fields (complexity, requirements, plan, branch, PR, merge) conditionally rendered only when non-null"

# Metrics
duration: 5min
completed: 2026-02-12
---

# Phase 2 Plan 02: Demand Creation Form and Detail Page Summary

**Demand creation via Sheet side panel with zod validation, demand detail page with 7-stage pipeline progress bar, and clickable card links to detail view**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-12T03:31:51Z
- **Completed:** 2026-02-12T03:36:48Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Demand creation form with title, description, priority, and project selector -- validates with same demandCreateSchema shared between frontend and backend
- Sheet side panel on board page keeps Kanban visible while creating demands -- project is pre-selected from board context
- Demand detail page at `/demands/:id` showing title, pipeline progress bar, priority badge, creation date, description, and cost
- Pipeline progress bar renders 7 stage segments with completed stages highlighted in primary color and current stage label in bold
- Demand cards on the board have a detail link icon (ExternalLink) that navigates to detail page without triggering drag-and-drop
- Progressive disclosure for future-phase fields (complexity, requirements, plan, branch, PR, merge status) -- ready for agent pipeline

## Task Commits

Each task was committed atomically:

1. **Task 1: Demand creation form with project selector and Sheet integration** - `683ce51` (feat)
2. **Task 2: Demand detail page with pipeline progress bar and clickable cards** - `3b21232` (feat)

## Files Created/Modified

- `apps/web/src/components/demands/demand-form.tsx` - Demand creation form with react-hook-form + zod, project selector, priority dropdown, toast feedback
- `apps/web/src/components/demands/demand-detail.tsx` - Full demand detail view with pipeline progress, metadata, description, cost, and progressive disclosure
- `apps/web/src/components/demands/pipeline-progress.tsx` - Visual 7-stage progress indicator with PIPELINE_STAGES and STAGE_LABELS
- `apps/web/src/app/(dashboard)/demands/[demandId]/page.tsx` - Demand detail page with useQuery fetch, loading skeleton, error/not-found state
- `apps/web/src/components/ui/sheet.tsx` - shadcn Sheet component (installed via shadcn CLI)
- `apps/web/src/components/ui/progress.tsx` - shadcn Progress component (installed via shadcn CLI)
- `apps/web/src/components/board/board-header.tsx` - Updated to accept onNewDemand callback (replaces Link navigation)
- `apps/web/src/app/(dashboard)/projects/[projectId]/board/page.tsx` - Integrated Sheet + DemandForm with controlled open state
- `apps/web/src/components/board/demand-card.tsx` - Added ExternalLink icon with stopPropagation for drag-safe navigation

## Decisions Made

- **Sheet side panel for demand creation:** Chose Sheet (side panel) over full-page form or Dialog. Keeps the board visible while creating, so user can see where the demand will appear. Controlled open state managed by board page.
- **ExternalLink icon instead of wrapping card in Link:** Adding a small link icon inside the card avoids the complexity of drag-click detection. `onClick` + `onPointerDown` with `stopPropagation` prevents the drag handler from capturing the click event.
- **Ternary for unknown-typed fields:** `demand.requirements` and `demand.plan` are typed as `unknown` in the Demand interface. Short-circuit `&&` expressions with `unknown` evaluate to `unknown | JSX.Element` which is not assignable to `ReactNode`. Using ternary (`!= null ? <div/> : null`) produces `JSX.Element | null`, which is valid.
- **Progressive disclosure:** Future-phase fields (complexity, requirements, plan, branchName, prUrl, mergeStatus) are conditionally rendered only when they have values. This provides a clean initial view for new demands while showing more detail as demands progress through the pipeline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error: unknown type not assignable to ReactNode**
- **Found during:** Task 2 (demand detail component build)
- **Issue:** `demand.requirements && <div>...</div>` and `demand.plan && <div>...</div>` caused TS error because `unknown && JSX.Element` evaluates to `unknown | JSX.Element`, which is not assignable to `ReactNode`
- **Fix:** Changed from short-circuit `&&` to ternary `demand.requirements != null ? <div>...</div> : null` for both `requirements` and `plan` fields
- **Files modified:** apps/web/src/components/demands/demand-detail.tsx
- **Verification:** `pnpm build` succeeds across all workspaces
- **Committed in:** 3b21232 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor TypeScript type narrowing fix. No scope creep.

## Issues Encountered

None beyond the auto-fixed TypeScript type issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Phase 2 Complete:**
- All Kanban and Demands requirements satisfied: board with drag-and-drop, demand CRUD, creation form, detail page with progress bar
- DEM-01 (create demand with title/description/priority): Demand form with zod validation
- DEM-02 (select project): Project pre-selected from board context
- DEM-03 (detail page with progress bar): Pipeline progress bar showing 7 stages

**Ready for Phase 3 (Agent Pipeline):**
- Demand detail page has progressive disclosure for complexity, requirements, and plan fields -- Discovery and Planning agents can populate these
- Pipeline progress bar automatically reflects stage changes as agents move demands through the pipeline
- Demand API supports stage updates for agent-driven pipeline transitions
- Board auto-polls every 5 seconds to show real-time agent progress

---
*Phase: 02-kanban-demands*
*Completed: 2026-02-12*

## Self-Check: PASSED

- All 6 claimed created files verified to exist on disk
- All 3 claimed modified files verified to exist on disk
- Commit 683ce51 (Task 1) verified in git log
- Commit 3b21232 (Task 2) verified in git log
- `pnpm build` succeeds across all workspaces (API + Web)
- Route `/demands/[demandId]` present in Next.js build output
