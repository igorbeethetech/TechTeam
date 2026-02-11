# Domain Pitfalls

**Domain:** AI Agent Orchestration Platform
**Researched:** 2026-02-11
**Confidence:** MEDIUM

> **Research Context:** Based on common failure modes in job queue systems, multi-tenant SaaS, AI agent systems, and Git automation. WebSearch unavailable, relying on training data patterns and domain expertise.

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Tenant Data Leakage (Multi-Tenant Isolation Failure)

**What goes wrong:** User from Tenant A sees/modifies data from Tenant B due to missing `tenantId` filter.

**Why it happens:**
- Developer forgets `where: { tenantId }` on a Prisma query
- Raw SQL bypasses Prisma middleware
- Admin endpoints skip tenant filtering "for convenience"
- JWT token doesn't include `tenantId` claim

**Consequences:**
- **Security breach:** Competitor sees another company's demands, code, agent logs
- **Compliance violation:** GDPR, SOC2 failures
- **Loss of trust:** Platform credibility destroyed
- **Legal liability:** Lawsuits, regulatory fines

**Prevention:**
1. **Prisma middleware enforces filtering** (see ARCHITECTURE.md Pattern 1)
2. **Never use raw SQL** without tenant filtering
3. **Integration tests verify isolation:**
   ```typescript
   test('tenant A cannot access tenant B data', async () => {
     const tenantAPrisma = createPrismaClient('tenant_a')
     const tenantBPrisma = createPrismaClient('tenant_b')

     const projectA = await tenantAPrisma.project.create({ data: { name: 'A Project' } })
     const projectsFromB = await tenantBPrisma.project.findMany()

     expect(projectsFromB).not.toContainEqual(projectA)
   })
   ```
4. **Code review checklist:** Every Prisma query reviewed for tenant isolation
5. **Database constraints:** Foreign keys enforce tenantId consistency

**Detection:**
- Audit logs show user accessing data from different tenantId
- Monitoring: Alert on queries returning cross-tenant data
- Penetration testing: Explicitly test tenant boundary violations

---

### Pitfall 2: BullMQ Job Loss (Redis Data Persistence)

**What goes wrong:** Redis crashes or restarts → all queued jobs lost → demands stuck in "processing" forever.

**Why it happens:**
- Redis configured with default settings (no persistence)
- Redis runs in-memory only (AOF/RDB disabled)
- Redis eviction policy set to `allkeys-lru` (evicts job data when memory full)

**Consequences:**
- **Data loss:** Jobs disappear, demands never complete
- **Stuck demands:** UI shows "Processing" but no agent is running
- **User frustration:** "Why is my demand stuck for 3 hours?"
- **Manual recovery:** Developer must manually re-enqueue jobs

**Prevention:**
1. **Enable Redis persistence (AOF + RDB):**
   ```conf
   # redis.conf
   appendonly yes
   appendfsync everysec
   save 900 1
   save 300 10
   save 60 10000
   ```
2. **BullMQ job options:**
   ```typescript
   await queue.add('job-name', data, {
     removeOnComplete: 100, // Keep last 100 for metrics
     removeOnFail: false,   // Never remove failed jobs
     attempts: 3,           // Retry up to 3 times
     backoff: { type: 'exponential', delay: 2000 }
   })
   ```
3. **Job state in PostgreSQL:**
   ```prisma
   model Demand {
     id          String
     status      DemandStatus // inbox, discovery, planning, etc.
     jobId       String?      // BullMQ job ID for correlation
     lastJobAt   DateTime?    // When job was last enqueued
   }
   ```
   On worker start: reconcile PostgreSQL state with BullMQ queue
4. **Monitoring:** Alert if job count drops unexpectedly

**Detection:**
- Demand `status != 'done'` but `lastJobAt` > 10 minutes ago and no active job
- BullMQ dashboard shows 0 queued jobs but PostgreSQL shows active demands
- Redis memory usage approaching limit (eviction risk)

---

### Pitfall 3: Concurrent Development Merge Conflicts (Git Chaos)

**What goes wrong:** 3 concurrent Development jobs on same project → 3 PRs with overlapping file changes → merge conflicts on every PR.

**Why it happens:**
- No branch coordination between concurrent jobs
- All 3 agents modify same files (e.g., `package.json`, shared utilities)
- Merge strategy doesn't account for concurrent PRs

**Consequences:**
- **3-tier merge fails:** Even AI can't resolve conflicts when 3 PRs all touch same lines
- **Human escalation overload:** Every demand needs manual merge
- **Throughput collapse:** Concurrency meant to speed up, but conflicts slow down
- **Code quality issues:** Rushed conflict resolution introduces bugs

**Prevention:**
1. **Branch per demand (already in design):**
   ```typescript
   const branchName = `demand/${demandId}` // Each demand gets unique branch
   await git.checkout('-b', branchName)
   ```
2. **Lock high-conflict files during Development:**
   ```typescript
   // Check if concurrent demands are modifying same files
   const activeDemands = await getActiveDevelopmentDemands(projectId)
   const filesBeingModified = activeDemands.flatMap(d => d.modifiedFiles)

   if (filesBeingModified.some(f => HIGH_CONFLICT_FILES.includes(f))) {
     // Delay this job until other Development jobs complete
     throw new Error('High-conflict file locked by another demand')
   }
   ```
3. **Merge PRs immediately (don't accumulate):**
   - Tier 1 auto-merge → main branch updated
   - Next PR rebases on latest main before merging
   - Queue order ensures sequential merges
4. **Agent coordination (advanced):**
   - Development agent checks for concurrent PRs
   - If conflict detected, agent re-generates code based on latest main
   - Automatic rebase before PR creation

**Detection:**
- GitHub API: Count open PRs per project. Alert if >3.
- PR merge time: Track time from PR creation → merge. Spike = conflict issues.
- Agent logs: "Merge conflict detected" appearing frequently

---

### Pitfall 4: Runaway Token Costs (Agent Budget Control)

**What goes wrong:** Single demand consumes $100+ in tokens due to agent hallucination, infinite loops, or overly verbose output.

**Why it happens:**
- No token budget limits per phase/demand
- Agent retries failed operation 50 times (exponential cost)
- Agent generates massive output (100KB+ logs, 10K line code files)
- Planning agent generates 500 sub-tasks for simple feature

**Consequences:**
- **Cost explosion:** Monthly Claude API bill jumps from $500 → $5,000
- **Budget unpredictability:** Can't estimate project costs
- **Tenant dissatisfaction:** Client billed $200 for a $10 feature
- **Platform unsustainability:** Margins disappear

**Prevention:**
1. **Per-phase token budgets:**
   ```typescript
   const PHASE_BUDGETS = {
     discovery: 5000,   // Max 5K tokens
     planning: 10000,   // Max 10K tokens
     development: 50000, // Max 50K tokens
     testing: 5000,
     merge: 3000
   }

   async function executeAgent(phase, prompt) {
     const budget = PHASE_BUDGETS[phase]
     const result = await anthropic.messages.create({
       max_tokens: budget,
       // ...
     })

     if (result.usage.output_tokens >= budget * 0.95) {
       // Agent hit budget limit — likely hallucinating
       await logWarning('Agent approached token budget', { phase, demandId })
     }

     return result
   }
   ```
2. **Retry limits with backoff:**
   ```typescript
   // BullMQ job options
   {
     attempts: 3, // Max 3 retries (not 50)
     backoff: { type: 'exponential', delay: 2000 }
   }
   ```
3. **Cost alerts:**
   ```typescript
   const demandCost = await calculateDemandCost(demandId)
   if (demandCost > 10) { // $10 threshold
     await notifyAdmin(`Demand ${demandId} cost $${demandCost}`)
   }
   ```
4. **Per-tenant monthly budget:**
   ```prisma
   model Tenant {
     id            String
     monthlyBudget Decimal  @default(100.00)
     currentSpend  Decimal  @default(0)
   }
   ```
   Before enqueuing job: Check if tenant budget exceeded

**Detection:**
- Daily cost report: Anomalies in per-demand costs
- Real-time monitoring: Alert if single job exceeds $5
- Tenant dashboard: "You've used 80% of monthly budget"

---

### Pitfall 5: Agent Execution Timeout Hell (Long-Running Jobs)

**What goes wrong:** Development agent takes 30 minutes → HTTP timeout → job marked failed → demand stuck.

**Why it happens:**
- Complex features require 10K+ lines of code generation
- Agent waits for external API calls (GitHub, test runners)
- Claude API rate limiting causes 5-minute delays mid-execution
- No checkpoint/resume mechanism

**Consequences:**
- **Job failures:** BullMQ marks job failed after timeout
- **Wasted tokens:** Partial work discarded, re-run from scratch
- **User frustration:** "Why does my demand keep failing?"
- **Support burden:** Manual intervention to restart jobs

**Prevention:**
1. **Generous timeouts (BullMQ worker):**
   ```typescript
   const worker = new Worker('development-queue', async (job) => {
     // ...
   }, {
     lockDuration: 600000, // 10 minutes
     lockRenewTime: 300000  // Renew every 5 minutes
   })
   ```
2. **Child process timeout (Claude CLI):**
   ```typescript
   const { stdout } = await execAsync(`claude -p "${prompt}"`, {
     timeout: 1800000 // 30 minutes for complex Development
   })
   ```
3. **Progress checkpoints (advanced):**
   ```typescript
   // Development agent outputs incremental commits
   // If job fails, resume from last commit instead of re-start
   const lastCommit = await git.log({ maxCount: 1 })
   const prompt = `Continue development from commit ${lastCommit.hash}`
   ```
4. **Break large demands into sub-tasks:**
   - Planning agent generates 3-5 sub-tasks max (not 50)
   - Each sub-task = separate Development job
   - Smaller jobs = faster execution, less timeout risk

**Detection:**
- Job duration metrics: Alert if job exceeds 20 minutes (investigate)
- Timeout logs: Track `ETIMEDOUT` errors in agent execution
- Job retry patterns: Same job retrying 3x due to timeout

---

## Moderate Pitfalls

### Pitfall 6: Prisma Migration Conflicts in Multi-Developer Scenarios

**What goes wrong:** Developer A creates migration `001_add_column_x`, Developer B creates migration `001_add_column_y` → migration conflicts on merge.

**Prevention:**
- Single `prisma/schema.prisma` in monorepo root
- Migration naming includes timestamp: `prisma migrate dev --name add_column_x`
- Team coordination: Announce schema changes in Slack before migrating
- CI check: Fail if multiple migrations with same timestamp

---

### Pitfall 7: TanStack Query Cache Staleness (UI Shows Old Data)

**What goes wrong:** Agent completes Development phase → UI still shows "Planning" → user confused.

**Prevention:**
- Aggressive `staleTime: 3000` (3 seconds)
- `refetchInterval: 5000` for active demands
- Optimistic updates on mutations:
  ```typescript
  const mutation = useMutation({
    mutationFn: moveDemand,
    onMutate: async (newData) => {
      // Optimistically update cache before API response
      queryClient.setQueryData(['demand', demandId], newData)
    }
  })
  ```

---

### Pitfall 8: GitHub API Rate Limiting (PR Creation Failures)

**What goes wrong:** Create 100 PRs in 1 hour → GitHub rate limit (5000 req/hour) → PRs fail.

**Prevention:**
- Octokit with rate limit awareness: `@octokit/plugin-throttling`
- Retry with exponential backoff on 403 rate limit errors
- Monitor rate limit headers: `X-RateLimit-Remaining`
- Upgrade to GitHub Enterprise if needed (higher limits)

---

### Pitfall 9: Drag-and-Drop State Desync (Kanban UI Glitches)

**What goes wrong:** User drags Demand to Discovery → API rejects (business rule) → UI shows Discovery but DB shows Inbox.

**Prevention:**
- Optimistic updates + rollback on error:
  ```typescript
  const { mutate } = useMutation({
    mutationFn: moveDemand,
    onMutate: async (newData) => {
      await queryClient.cancelQueries(['demands'])
      const previous = queryClient.getQueryData(['demands'])
      queryClient.setQueryData(['demands'], newData) // Optimistic
      return { previous }
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['demands'], context.previous) // Rollback
    }
  })
  ```

---

### Pitfall 10: Agent Hallucination (Generating Wrong Code)

**What goes wrong:** Development agent generates code that doesn't match requirements → Testing agent approves (also hallucinates) → bad code merged.

**Prevention:**
- Testing agent runs actual unit tests (not just code review)
- CI pipeline validates PR (linting, type-checking, tests)
- Tier 1 auto-merge requires green CI (not just agent approval)
- Human review before Tier 2/3 merge escalation

---

## Minor Pitfalls

### Pitfall 11: Environment Variable Drift (.env vs Production)

**What goes wrong:** Local `.env` has `DATABASE_URL=localhost`, production has managed DB → code works locally, breaks in production.

**Prevention:**
- `@fastify/env` with Zod schema validation (see STACK.md)
- Fail fast on startup if required env vars missing
- `.env.example` file with all required vars documented

---

### Pitfall 12: Monorepo Dependency Version Drift

**What goes wrong:** `apps/web` uses `zod@3.22`, `apps/api` uses `zod@3.20` → type mismatches.

**Prevention:**
- Single `package.json` at root with `devDependencies` for shared tools
- `pnpm workspace` protocol for internal packages: `"@acme/shared": "workspace:*"`
- Renovate/Dependabot for automated dependency updates

---

### Pitfall 13: Turborepo Cache Poisoning

**What goes wrong:** Bad build cached → subsequent builds use poisoned cache → errors everywhere.

**Prevention:**
- Turborepo cache invalidation: `pnpm turbo run build --force` (skip cache)
- CI: `turbo prune` before builds (fresh cache per deploy)

---

### Pitfall 14: Forgot to Run `prisma generate` After Schema Change

**What goes wrong:** Update `schema.prisma` → Prisma client not regenerated → TypeScript errors.

**Prevention:**
- `postinstall` script in root `package.json`:
  ```json
  {
    "scripts": {
      "postinstall": "cd packages/shared && prisma generate"
    }
  }
  ```

---

### Pitfall 15: Agent Logs Too Verbose (Database Bloat)

**What goes wrong:** Store full Claude API response (100KB) per job → 10K demands = 1GB of logs → slow queries.

**Prevention:**
- Store summary only: `{ tokens, cost, duration, success, errorMessage }`
- Full logs (stdout/stderr) stored in S3/file storage, not PostgreSQL
- Retention policy: Delete logs older than 90 days

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Authentication** | JWT secret leak → all tokens compromised | Rotate secrets regularly, use strong secrets (32+ chars), never commit to Git |
| **Multi-Tenant Setup** | Tenant data leakage (Pitfall 1) | Prisma middleware, integration tests, penetration testing |
| **BullMQ Integration** | Job loss on Redis restart (Pitfall 2) | Redis persistence (AOF + RDB), job state in PostgreSQL |
| **Agent Execution** | Timeout failures (Pitfall 5), runaway costs (Pitfall 4) | Generous timeouts, token budgets, cost alerts |
| **Git Integration** | Merge conflicts (Pitfall 3), GitHub rate limits (Pitfall 8) | Branch per demand, file locking, rate limit handling |
| **Kanban UI** | State desync (Pitfall 9), cache staleness (Pitfall 7) | Optimistic updates with rollback, aggressive refetching |
| **Metrics Dashboard** | Database bloat from logs (Pitfall 15) | Summary storage only, retention policies, S3 for full logs |
| **3-Tier Merge** | Agent hallucination (Pitfall 10) | CI validation, human review gates, test automation |

---

## Lessons from Similar Platforms

**Note:** Unable to verify current 2026 postmortems (WebSearch unavailable). Based on training data patterns.

### CI/CD Platform Failures

**Jenkins plugins causing security vulnerabilities:**
- **Lesson:** Minimize dependencies. Use official SDKs (Anthropic, Octokit) only.

**CircleCI secrets leak (2023):**
- **Lesson:** Encrypt GitHub tokens in database, rotate regularly, never log secrets.

### Job Queue Platform Failures

**Sidekiq job loss during Redis failover:**
- **Lesson:** Redis persistence + PostgreSQL state reconciliation (Pitfall 2).

**Celery infinite retry loops:**
- **Lesson:** Hard retry limits (max 3 attempts), exponential backoff.

### Multi-Tenant SaaS Failures

**Codecov tenant isolation bug (2021):**
- **Lesson:** Automated tenant isolation tests, Prisma middleware (Pitfall 1).

**Mailchimp cross-tenant data leak:**
- **Lesson:** Code review every query for tenant filtering, penetration testing.

---

## Pre-Launch Security Checklist

Before deploying to production, verify:

- [ ] Prisma middleware enforces `tenantId` filtering (Pitfall 1)
- [ ] Integration tests verify tenant isolation
- [ ] Redis persistence enabled (AOF + RDB) (Pitfall 2)
- [ ] BullMQ job options set (retry limits, persistence)
- [ ] Token budgets per phase configured (Pitfall 4)
- [ ] Cost alerts set up ($10 per demand, $500 per tenant/month)
- [ ] Generous timeouts for long-running jobs (Pitfall 5)
- [ ] GitHub tokens encrypted in database
- [ ] Environment variables validated (@fastify/env + Zod)
- [ ] CI pipeline validates PRs (linting, type-check, tests)
- [ ] Error tracking configured (Sentry or equivalent)
- [ ] Monitoring alerts (job failures, API downtime, cost spikes)
- [ ] Backup strategy (PostgreSQL daily backups, point-in-time recovery)
- [ ] Rate limiting per tenant (prevent abuse)
- [ ] Security headers configured (@fastify/helmet)

---

## Sources

**Job Queue Systems:**
- BullMQ common pitfalls (Redis persistence, job loss patterns)
- Sidekiq/Celery failure modes (retry loops, timeout issues)

**Multi-Tenant SaaS:**
- Tenant isolation best practices (Prisma middleware patterns)
- Security incidents (Codecov, Mailchimp leaks — training data)

**AI Agent Systems:**
- Token cost management (GPT-3/4, Claude API patterns)
- Agent hallucination mitigation (testing, validation gates)

**Git Automation:**
- Merge conflict patterns (concurrent branches, rebasing)
- GitHub API rate limiting (Octokit best practices)

**Confidence:** MEDIUM
- Common pitfalls well-documented in training data (MEDIUM-HIGH confidence)
- Specific version behaviors require 2026 verification (MEDIUM confidence)
- Cost/token estimates based on Claude API pricing (may change, LOW-MEDIUM confidence)

**Validation Required:**
- BullMQ 5.x persistence behavior (verify official docs)
- Prisma middleware performance impact (benchmark at scale)
- Claude API rate limits and pricing (check current 2026 rates)
- GitHub API rate limits for automated PR creation (verify current limits)

---

*Pitfall research for: AI Agent Orchestration Platform*
*Researched: 2026-02-11*
*Confidence: MEDIUM (patterns validated, specifics require 2026 verification)*
