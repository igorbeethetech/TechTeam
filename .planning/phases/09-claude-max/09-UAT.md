---
status: complete
phase: 09-claude-max
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md]
started: 2026-02-14T21:00:00Z
updated: 2026-02-14T21:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Settings page shows execution mode card
expected: Navigate to Settings page. Below the existing API key cards, an "Agent Execution Mode" card appears with a Terminal icon, description text explaining SDK vs CLI, and two radio options.
result: pass

### 2. Default selection is API Key (SDK)
expected: On first load (or if never changed), the "API Key (SDK)" radio is selected by default. Description says "Uses Anthropic API key configured above. Pay per token usage."
result: pass

### 3. Toggle to Claude MAX (CLI) with immediate save
expected: Click "Claude MAX (CLI)" radio. Selection changes immediately. A green "Execution mode saved" confirmation appears briefly (no separate Save button needed).
result: pass (after fix)
note: Initially returned PUT 500 due to missing tenantId in upsert create clause. Fixed in settings.ts.

### 4. Selection persists after page refresh
expected: After selecting "Claude MAX (CLI)", refresh the page (F5). The "Claude MAX (CLI)" radio remains selected -- the choice was persisted to the server.
result: pass (after fix)

### 5. Toggle back to SDK works
expected: Click "API Key (SDK)" radio. Selection changes back. Green confirmation appears again. Refresh page -- "API Key (SDK)" is selected.
result: pass (after fix)

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Fixes Applied During UAT

### FIX-1: Missing tenantId in upsert create (settings.ts:49)
- **Symptom:** PUT /api/settings returns 500 (PrismaClientValidationError: Argument tenantId is missing)
- **Root cause:** `create: data` in upsert did not include `tenantId`. When only `agentExecutionMode` was sent, the `data` object lacked the required field.
- **Fix:** Changed `create: data` to `create: { ...data, tenantId: request.session!.session.activeOrganizationId! }`
- **File:** apps/api/src/routes/settings.ts line 49

### FIX-2: Missing ws package (API startup crash)
- **Symptom:** API fails to start with ERR_MODULE_NOT_FOUND: Cannot find package 'ws'
- **Root cause:** `ws` was a transitive dependency of `@fastify/websocket` but not a direct dependency. pnpm strict mode blocks transitive imports.
- **Fix:** `pnpm --filter api add ws`
- **File:** apps/api/package.json

## Gaps

[none]
