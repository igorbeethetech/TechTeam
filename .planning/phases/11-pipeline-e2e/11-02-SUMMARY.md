---
phase: 11-pipeline-e2e
plan: 02
subsystem: api
tags: [e2e, pipeline, validation, bug-fixes, cli-mode, merge, git]

# Dependency graph
requires:
  - phase: 11-pipeline-e2e/01
    provides: "injectGitToken and restoreGitRemote for authenticated git push"
  - phase: 03-agent-pipeline
    provides: "Full pipeline: Discovery, Planning, Development, Testing stages"
  - phase: 05-merge-concurrency
    provides: "Merge worker with 3-step escalation"
provides:
  - "Proven end-to-end pipeline: Inbox -> Discovery -> Planning -> Development -> Testing -> Merge -> Done"
  - "CLI execution mode (Claude MAX) for all agent phases"
  - "Multiple runtime bug fixes for production readiness"
affects: [all-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI mode: spawn claude CLI subprocess with stdin pipe, --output-format json, --no-session-persistence"
    - "Remove CLAUDECODE and ANTHROPIC_API_KEY from spawned env for Claude MAX subscription"
    - "URL sanitization: strip literal \\n sequences and control chars from git remote URLs"

key-files:
  created: []
  modified:
    - apps/api/src/agents/base-agent.ts
    - apps/api/src/agents/base-agent-cli.ts
    - apps/api/src/queues/agent.worker.ts
    - apps/api/src/lib/git.ts

key-decisions:
  - "CLI mode as primary execution: user has Claude MAX subscription, not API credits"
  - "Promise.race timeout wrapper in base-agent.ts to guarantee timeout propagation"
  - "Schema embedded in prompt text for CLI mode to avoid Windows command-line length limits"
  - "Aggressive URL sanitization (literal \\n, newlines, trim) to prevent git config corruption"

patterns-established:
  - "CLI executor pattern: stdin pipe prompt, delete CLAUDECODE/ANTHROPIC_API_KEY env vars"
  - "URL sanitization on all git remote operations to prevent escape sequence corruption"

# Metrics
duration: ~4 hours (including debugging across multiple context windows)
completed: 2026-03-02
---

# Phase 11 Plan 02: Full E2E Pipeline Validation Summary

**End-to-end pipeline test: demand traversed all 7 stages on a real GitHub repo with Claude MAX CLI execution mode**

## Performance

- **Duration:** ~4 hours (test + fix iterations)
- **Completed:** 2026-03-02
- **Tasks:** 2 (setup + pipeline execution/validation)
- **Files modified:** 4 (bug fixes during validation)

## PIPE Requirements Verification

- [x] **PIPE-01:** Demand flowed through all 7 stages (Inbox -> Discovery -> Planning -> Development -> Testing -> Merge -> Done)
- [x] **PIPE-02:** Development agent created branch `demand/cmm8adgp9000480vyw9nzb659-add-fibonacci-utility-function`, pushed code, opened PR #1
- [x] **PIPE-03:** Testing agent produced structured verdict with rationale (approved after one rejection)
- [x] **PIPE-04:** Approved demand merged automatically - local merge + push to origin/main + PR closed
- [x] **PIPE-05:** Testing rejection feedback loop verified - testing:failed then re-ran Development, Testing approved on retry

## Evidence

- **Demand ID:** `cmm8adgp9000480vyw9nzb659`
- **Final state:** `stage=done`, `mergeStatus=merged`, `completedAt=2026-03-02T00:11:17.666Z`
- **GitHub repo:** `igorbeethetech/techteam-e2e-test`
- **Merge commit:** `c516dfa` on origin/main
- **PR:** #1 (closed after local merge)
- **Agent runs:** 26 total (multiple retries due to bug fixes during validation)
- **Total cost:** $1.30 (via Claude MAX CLI mode)
- **Total tokens:** 1,479 (tracked tokens - CLI mode reports 0 for SDK token fields)

## Runtime Bugs Fixed

### 1. AbortController timeout not propagating (base-agent.ts)
- **Symptom:** Discovery agent hung past timeout, never aborted
- **Root cause:** AbortController.abort() alone didn't terminate the SDK query loop
- **Fix:** Wrapped with Promise.race - timeout rejects independently of abort signal

### 2. CLI mode CLAUDECODE env blocking (base-agent-cli.ts)
- **Symptom:** "Claude Code cannot be launched inside another Claude Code session"
- **Root cause:** Nested CLI subprocess inherited CLAUDECODE env var from parent
- **Fix:** `delete env.CLAUDECODE` before spawning

### 3. CLI mode using API key instead of MAX subscription (base-agent-cli.ts)
- **Symptom:** "Credit balance is too low" despite Claude MAX subscription
- **Root cause:** CLI subprocess inherited ANTHROPIC_API_KEY env var, used API credits instead of MAX
- **Fix:** `delete env.ANTHROPIC_API_KEY` before spawning

### 4. Windows command line too long (base-agent-cli.ts)
- **Symptom:** "Linha de comando muito longa" error
- **Root cause:** Full prompt with JSON schema passed via `-p` command line arg
- **Fix:** Read prompt from stdin via `-p -`, pipe full prompt including schema via `child.stdin.write()`

### 5. CLI structured output string parsing (base-agent-cli.ts)
- **Symptom:** "Expected object, received string" in schema validation
- **Root cause:** CLI returns structured output as string in `json.result`, not pre-parsed JSON
- **Fix:** Added `JSON.parse(output)` attempt when `typeof output === "string"`

### 6. Git remote URL corruption with literal \n (git.ts)
- **Symptom:** "url contains a newline in its path component" on merge push
- **Root cause:** `restoreGitRemote` stored URL with trailing newlines that git escaped to literal `\n` in config
- **Fix:** Aggressive sanitization: `.replace(/\\n/g, "").replace(/[\r\n]+/g, "").trim()` in both `injectGitToken` and `restoreGitRemote`, plus trim token

### 7. Agent worker timeout too short for CLI mode (agent.worker.ts)
- **Symptom:** Agents timing out because CLI mode is slower than SDK
- **Fix:** Increased phase timeouts (Discovery/Planning: 10min, Development: 60min, Testing: 15min)

## Deviations from Plan

- **Execution mode:** Used CLI mode (Claude MAX) instead of SDK (Anthropic API) due to user having no API balance
- **Multiple iterations:** Required multiple context windows due to bug density in first-ever real execution
- **Git config corruption:** Required manual fix of test repo's remote URL after literal `\n` was embedded

## Files Modified (Bug Fixes)

- `apps/api/src/agents/base-agent.ts` - Promise.race timeout wrapper
- `apps/api/src/agents/base-agent-cli.ts` - Complete rewrite for CLI mode reliability
- `apps/api/src/queues/agent.worker.ts` - Increased phase timeouts
- `apps/api/src/lib/git.ts` - URL sanitization in injectGitToken/restoreGitRemote

## Self-Check: PASSED

- Demand at stage=done with mergeStatus=merged and completedAt set
- GitHub repo has merge commit c516dfa on origin/main
- PR #1 is closed
- fibonacci.ts exists in the repo
- All 5 PIPE requirements verified

---
*Phase: 11-pipeline-e2e*
*Completed: 2026-03-02*
