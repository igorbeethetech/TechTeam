---
phase: 01-foundation
plan: 03
subsystem: multi-tenant-isolation
tags: [prisma-client-extensions, tenant-isolation, project-crud, better-auth-org, react-query, shadcn-forms, tanstack-query]

# Dependency graph
requires:
  - phase: 01-01
    provides: Turborepo monorepo with Prisma 7, Fastify 5, Next.js 15, and shared packages
  - phase: 01-02
    provides: Better Auth with organization plugin and session management
provides:
  - forTenant() Prisma Client Extension for automatic tenantId filtering on all Project queries
  - Tenant-scoped Fastify plugin injecting request.prisma per-request based on activeOrganizationId
  - Project CRUD API (GET /api/projects, POST /api/projects, GET /api/projects/:id, PUT /api/projects/:id, PATCH /api/projects/:id/archive, PATCH /api/projects/:id/unarchive) with auth + tenant middleware
  - Database seed creating "Bee The Tech" default organization
  - Full project management UI: list with empty state, create form, edit form, archive/unarchive buttons
  - TanStack Query integration for data fetching and cache management
  - ProjectCard, ProjectList, and ProjectForm components using shadcn/ui and Zod validation
affects: [02-kanban, 03-agent-pipeline, 04-dev-testing]

# Tech tracking
tech-stack:
  added: [fastify-plugin, sonner, "@tanstack/react-query@5.90", "@shadcn/ui badge", "@shadcn/ui dialog", "@shadcn/ui select", "@shadcn/ui textarea", react-hook-form, "@hookform/resolvers"]
  patterns: [prisma-client-extensions-tenant-isolation, fastify-request-decoration, protected-scope-middleware-chain, tanstack-query-mutations-invalidations, zod-form-validation]

key-files:
  created:
    - packages/database/src/tenant.ts
    - apps/api/src/plugins/tenant.ts
    - apps/api/src/routes/projects.ts
    - packages/database/prisma/seed.ts
    - apps/web/src/components/projects/project-card.tsx
    - apps/web/src/components/projects/project-list.tsx
    - apps/web/src/components/projects/project-form.tsx
    - apps/web/src/app/(dashboard)/projects/page.tsx
    - apps/web/src/app/(dashboard)/projects/new/page.tsx
    - apps/web/src/app/(dashboard)/projects/[id]/edit/page.tsx
    - apps/web/src/components/providers.tsx
    - apps/web/src/components/ui/badge.tsx
    - apps/web/src/components/ui/dialog.tsx
    - apps/web/src/components/ui/select.tsx
    - apps/web/src/components/ui/textarea.tsx
  modified:
    - packages/database/src/client.ts
    - packages/database/src/index.ts
    - apps/api/src/server.ts
    - apps/web/src/app/(dashboard)/layout.tsx
    - apps/web/src/app/(dashboard)/page.tsx
    - apps/web/src/app/layout.tsx
    - apps/web/src/lib/api.ts
    - apps/web/src/lib/auth-client.ts
    - packages/shared/src/index.ts

key-decisions:
  - "Prisma Client Extensions typed args require `any` cast for $allModels.$allOperations -- TypeScript limitation with dynamic model operations"
  - "TENANT_MODELS array defines which models get automatic tenantId filtering -- currently only Project, excludes User (managed by Better Auth)"
  - "Organization created on signup with activeOrganizationId set immediately -- ensures tenant context exists from first login"
  - "Removed .js extensions from shared package exports -- webpack resolver incompatibility despite ESM imports working in Node/tsx"
  - "Empty PATCH body handling: removed Content-Type header when body is undefined to avoid 400 errors from Fastify"

patterns-established:
  - "Prisma Client Extension pattern: forTenant(tenantId) returns extended client with $allModels.$allOperations query interceptor injecting tenantId into where/data"
  - "Fastify tenant plugin: decorates request.prisma with tenant-scoped client from session.activeOrganizationId in preHandler hook"
  - "Protected route scope: auth plugin (validates session) + tenant plugin (scopes data) registered together, project routes nested inside"
  - "TanStack Query cache invalidation: useMutation onSuccess calls queryClient.invalidateQueries(['projects']) to refresh list after create/update/archive"
  - "Zod schema input types: Use z.input<typeof schema> for form types when schema has transforms or defaults differing from output type"

# Metrics
duration: 47min
completed: 2026-02-11
---

# Phase 1 Plan 03: Multi-Tenant Project CRUD Summary

**Prisma Client Extensions for automatic tenant isolation, full project CRUD API with tenant-scoped queries, and complete project management UI with TanStack Query integration**

## Performance

- **Duration:** 47 min
- **Started:** 2026-02-11T22:52:47-03:00
- **Completed:** 2026-02-11T23:29:14-03:00
- **Tasks:** 3 (2 auto-exec + 1 human-verify)
- **Files modified:** 26

## Accomplishments

- Multi-tenant data isolation via Prisma Client Extensions -- all Project queries automatically filtered by tenantId without manual where clauses
- Tenant-scoped Prisma client per request: request.prisma uses forTenant(activeOrganizationId) from Better Auth session
- Project CRUD API with 6 endpoints (list, get, create, update, archive, unarchive) -- all protected by auth + tenant middleware chain
- Database seed creates "Bee The Tech" default organization for testing
- Full project management UI: empty state, create form, edit form, list view with cards, archive/unarchive actions
- TanStack Query for data fetching with automatic cache invalidation after mutations
- Zod-validated forms using react-hook-form with error display and loading states
- Dashboard home updated with quick stats showing active project count and management link
- Human verification confirmed: registration flow, project CRUD operations, tenant isolation, session persistence all working end-to-end

## Task Commits

Each task was committed atomically:

1. **Task 1: Tenant isolation, project CRUD API, and database seed** - `a6a0b23` (feat)
2. **Task 2: Project management UI (list, create, edit, archive)** - `dbc2111` (feat)
3. **Task 3: Phase 1 complete verification** - Human approved
4. **Post-execution fixes** - `7697096` (fix)

## Files Created/Modified

- `packages/database/src/tenant.ts` - forTenant() Prisma Client Extension with $allModels.$allOperations interceptor for read/write operations
- `packages/database/src/index.ts` - Export forTenant function
- `packages/database/src/client.ts` - Updated to export base prisma client for extension
- `apps/api/src/plugins/tenant.ts` - Fastify plugin decorating request.prisma with tenant-scoped client from session.activeOrganizationId
- `apps/api/src/routes/projects.ts` - Project CRUD routes: GET /, POST /, GET /:id, PUT /:id, PATCH /:id/archive, PATCH /:id/unarchive
- `apps/api/src/server.ts` - Protected scope registering auth + tenant plugins before project routes
- `packages/database/prisma/seed.ts` - Upserts "Bee The Tech" organization with slug "bee-the-tech"
- `apps/web/src/components/projects/project-card.tsx` - Card component showing project name, description, tech stack badge, repo URL, status, metadata, edit/archive buttons
- `apps/web/src/components/projects/project-list.tsx` - List component with useQuery, loading skeleton, empty state, responsive grid (1-3 cols), archive/unarchive mutations
- `apps/web/src/components/projects/project-form.tsx` - Create/edit form with Zod validation via react-hook-form, 7 fields (name, description, repo URL/path, tech stack, maxConcurrentDev, mergeStrategy)
- `apps/web/src/app/(dashboard)/projects/page.tsx` - Projects list page
- `apps/web/src/app/(dashboard)/projects/new/page.tsx` - New project form page
- `apps/web/src/app/(dashboard)/projects/[id]/edit/page.tsx` - Edit project form page with data fetch
- `apps/web/src/components/providers.tsx` - QueryClientProvider wrapper with staleTime: 30s, retry: 1
- `apps/web/src/components/ui/badge.tsx` - shadcn/ui Badge component (for tech stack and status)
- `apps/web/src/components/ui/dialog.tsx` - shadcn/ui Dialog component (for confirmation modals)
- `apps/web/src/components/ui/select.tsx` - shadcn/ui Select component (for maxConcurrentDev, mergeStrategy)
- `apps/web/src/components/ui/textarea.tsx` - shadcn/ui Textarea component (for description)
- `apps/web/src/app/(dashboard)/layout.tsx` - Added activeOrganizationId auto-fix after registration, improved header with user display
- `apps/web/src/app/(dashboard)/page.tsx` - Dashboard home with active project count, manage projects link
- `apps/web/src/app/layout.tsx` - Wrapped children with Providers component for TanStack Query
- `apps/web/src/lib/api.ts` - Fixed to include credentials in fetch for cross-origin cookies, improved Content-Type handling for empty PATCH
- `apps/web/src/lib/auth-client.ts` - Added BETTER_AUTH_URL environment variable for consistent baseURL
- `packages/shared/src/index.ts` - Removed .js extensions from exports for webpack compatibility

## Decisions Made

- **Prisma Client Extensions typed args:** TypeScript requires `any` cast for `args` parameter in `$allModels.$allOperations` handler due to inability to properly type dynamic model operations across all Prisma models -- unavoidable TypeScript limitation, runtime safety preserved by Prisma's internal typing
- **TENANT_MODELS array approach:** Only Project model gets automatic tenantId filtering -- User model excluded because Better Auth manages user data separately with its own isolation via organization membership tables
- **Organization auto-creation on signup:** 01-02 already creates organization during registration and sets activeOrganizationId -- this plan relies on that context being available in session for tenant scoping
- **Shared package .js extensions removed:** Despite ESM best practices requiring .js extensions in imports, webpack (used by Next.js) fails to resolve them when importing from workspace packages -- removed extensions from packages/shared exports for compatibility
- **Zod input vs output types:** ProjectForm uses `z.input<typeof projectCreateSchema>` instead of `z.infer` because Zod schemas with transforms/defaults have different input (what user provides) vs output (what API receives) types
- **Empty PATCH body Content-Type:** When PATCH request has no body (like archive/unarchive), sending `Content-Type: application/json` with undefined body causes Fastify to return 400 -- fixed by conditionally omitting Content-Type header when body is undefined

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma Client Extensions typed args require `any` cast**
- **Found during:** Task 1 (creating tenant.ts)
- **Issue:** TypeScript cannot properly type the `args` parameter in `$allModels.$allOperations` query handler because it needs to work across all models dynamically -- `Prisma.Args<Prisma.TypeMap['model']['Project'], 'findMany'>` pattern doesn't work for $allModels
- **Fix:** Used `any` type cast: `async (args: any) => {...}` -- runtime safety preserved by Prisma's internal type system
- **Files modified:** packages/database/src/tenant.ts
- **Verification:** pnpm build succeeds, tenant filtering works correctly at runtime
- **Committed in:** a6a0b23 (Task 1 commit)

**2. [Rule 3 - Blocking] client.ts dotenv loading from wrong CWD**
- **Found during:** Task 1 (running seed script)
- **Issue:** `dotenv.config()` in client.ts loads .env from CWD, but when running seed via tsx from packages/database, CWD is the package directory -- .env is at monorepo root
- **Fix:** Changed to explicit path: `dotenv.config({ path: path.resolve(__dirname, '../../.env') })`
- **Files modified:** packages/database/src/client.ts
- **Verification:** `pnpm --filter @techteam/database db:seed` succeeds, finds DATABASE_URL correctly
- **Committed in:** a6a0b23 (Task 1 commit)

**3. [Rule 3 - Blocking] Shared package .js extensions incompatible with webpack**
- **Found during:** Task 2 (importing projectCreateSchema in web app)
- **Issue:** packages/shared/src/index.ts uses .js extensions in exports (ESM best practice), but Next.js webpack resolver fails with "Module not found" errors when importing from workspace packages with .js extensions
- **Fix:** Removed .js extensions from all imports/exports in packages/shared
- **Files modified:** packages/shared/src/index.ts
- **Verification:** pnpm build succeeds for @techteam/web, imports resolve correctly
- **Committed in:** dbc2111 (Task 2 commit)

**4. [Rule 1 - Bug] Zod schema input vs output type mismatch in form**
- **Found during:** Task 2 (creating ProjectForm component)
- **Issue:** Using `z.infer<typeof projectCreateSchema>` for form type caused TypeScript errors because Zod schemas with `.default()` modifiers have different input types (user provides) vs output types (API receives) -- form should use input type
- **Fix:** Changed form type to `z.input<typeof projectCreateSchema>` which represents pre-transform/pre-default data structure
- **Files modified:** apps/web/src/components/projects/project-form.tsx
- **Verification:** TypeScript compiles without errors, form validation works correctly
- **Committed in:** dbc2111 (Task 2 commit)

### Post-Execution Fixes (After Human Verification)

**5. [Rule 1 - Bug] CORS missing PUT/PATCH/DELETE methods**
- **Found during:** Task 3 (human verification -- edit/archive actions failing)
- **Issue:** Fastify CORS plugin configured with `methods: ['GET', 'POST']` -- missing PUT, PATCH, DELETE required for update/archive operations
- **Fix:** Updated to `methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']`
- **Files modified:** apps/api/src/server.ts
- **Verification:** PUT /api/projects/:id and PATCH /api/projects/:id/archive now work from browser
- **Committed in:** 7697096 (fix commit)

**6. [Rule 1 - Bug] Auth client missing credentials: include for cross-origin cookies**
- **Found during:** Task 3 (human verification -- session not sent with API requests)
- **Issue:** Better Auth React client not configured to include credentials with fetch requests -- cookies not sent from localhost:3000 to localhost:3001
- **Fix:** Added `fetchOptions: { credentials: 'include' }` to authClient configuration
- **Files modified:** apps/web/src/lib/auth-client.ts
- **Verification:** Session cookies now sent with API requests, auth works correctly
- **Committed in:** 7697096 (fix commit)

**7. [Rule 1 - Bug] Project form didn't invalidate query cache after create/edit**
- **Found during:** Task 3 (human verification -- new project not appearing in list after creation)
- **Issue:** ProjectForm mutations didn't invalidate TanStack Query cache for projects list -- stale data shown after create/update
- **Fix:** Added `queryClient.invalidateQueries({ queryKey: ['projects'] })` to mutation onSuccess callbacks
- **Files modified:** apps/web/src/components/projects/project-form.tsx
- **Verification:** Project list refreshes automatically after create/update operations
- **Committed in:** 7697096 (fix commit)

**8. [Rule 1 - Bug] Empty PATCH body sent Content-Type: application/json causing 400**
- **Found during:** Task 3 (human verification -- archive/unarchive failing with 400 Bad Request)
- **Issue:** api.ts helper always set `Content-Type: application/json` even when body was undefined -- Fastify rejects requests with Content-Type but no body
- **Fix:** Conditionally set Content-Type only when body is defined: `...(body && { 'Content-Type': 'application/json' })`
- **Files modified:** apps/web/src/lib/api.ts
- **Verification:** PATCH /api/projects/:id/archive and unarchive now succeed
- **Committed in:** 7697096 (fix commit)

**9. [Rule 1 - Bug] activeOrganizationId not persisted after registration**
- **Found during:** Task 3 (human verification -- new users had null activeOrganizationId causing 403 errors)
- **Issue:** Organization created during signup but activeOrganizationId not immediately persisted to Better Auth session -- database has the org but session.activeOrganizationId is null until page reload
- **Fix:** Added auto-fix in dashboard layout: if session exists but activeOrganizationId is null, fetch user's orgs and set first one as active
- **Files modified:** apps/web/src/app/(dashboard)/layout.tsx
- **Verification:** New users can access projects page immediately after registration without refresh
- **Committed in:** 7697096 (fix commit)

---

**Total deviations:** 9 auto-fixed (4 during execution: 2 bugs + 2 blocking issues, 5 post-verification: all bugs)
**Impact on plan:** All fixes necessary for correctness and functionality. No scope creep -- every fix addressed bugs preventing plan success criteria from being met.

## Issues Encountered

- Better Auth organization plugin API documentation incomplete -- had to inspect Better Auth source code to understand how organization.setActive() works and when activeOrganizationId gets written to session
- TanStack Query v5 breaking change: `invalidateQueries()` now requires object parameter with `queryKey` instead of array argument -- updated based on error messages

## User Setup Required

None - no external service configuration required. Database seed runs automatically via `pnpm --filter @techteam/database db:seed`.

## Next Phase Readiness

**Phase 1 Foundation Complete:**
- Monorepo infrastructure: Turborepo + pnpm workspaces with shared packages
- Docker Compose: PostgreSQL 16 and Redis 7 running locally
- Authentication: Better Auth with email/password + organization plugin + session persistence
- Multi-tenant isolation: Prisma Client Extensions auto-filter by tenantId
- Project CRUD: Full API + UI for managing projects
- Database seed: "Bee The Tech" default organization exists

**Ready for Phase 2 (Kanban + Demands):**
- Tenant isolation patterns established -- Demand and DemandMessage models can reuse same forTenant() extension
- Protected route middleware chain proven -- demand API routes can nest in same auth + tenant scope
- Project model ready to have demands relationship added
- TanStack Query patterns established for real-time UI updates
- shadcn/ui component library expanded -- ready for Kanban board UI

**Potential concerns:**
- Better Auth organization API surface is minimal -- if Phase 2 needs multi-org switching UI, may need to research organization.list() capabilities
- Prisma Client Extensions $allModels pattern requires adding new tenant models to TENANT_MODELS array -- not automatic, but documented clearly in tenant.ts

---
*Phase: 01-foundation*
*Completed: 2026-02-11*

## Self-Check: PASSED

- All 15 claimed created files verified to exist on disk
- Commit a6a0b23 (Task 1) verified in git log
- Commit dbc2111 (Task 2) verified in git log
- Commit 7697096 (Post-execution fix) verified in git log
- Total file changes: 26 files across 3 commits (+1,333 lines, -23 lines)
