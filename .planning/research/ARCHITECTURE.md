# Architecture Patterns

**Domain:** AI Agent Orchestration Platform
**Researched:** 2026-02-11
**Confidence:** MEDIUM

> **Research Context:** Based on multi-tenant SaaS patterns, job queue architectures, and AI agent orchestration best practices. WebSearch unavailable, relying on training data and project context analysis.

## Recommended Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 15)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Dashboard    │  │ Kanban Board │  │ Demand Detail│         │
│  │ (Projects)   │  │ (DnD)        │  │ (Logs)       │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                            │ HTTP/REST (TanStack Query polling)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend API (Fastify)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Auth Routes  │  │ Project CRUD │  │ Demand CRUD  │         │
│  │ (JWT)        │  │              │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Agent        │  │ Job Enqueue  │  │ Metrics API  │         │
│  │ Orchestrator │  │ (BullMQ)     │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
          │                  │                      │
          │                  ▼                      │
          │         ┌─────────────────┐             │
          │         │  Redis (BullMQ) │             │
          │         │  Job Queue      │             │
          │         └─────────────────┘             │
          │                  │                      │
          │                  ▼                      │
          │         ┌─────────────────┐             │
          │         │  BullMQ Workers │             │
          │         │  (3 concurrent) │             │
          │         │                 │             │
          │         │  ┌───────────┐  │             │
          │         │  │Discovery  │  │             │
          │         │  │Planning   │  │             │
          │         │  │Development│  │             │
          │         │  │Testing    │  │             │
          │         │  │Merge      │  │             │
          │         │  └───────────┘  │             │
          │         └─────────────────┘             │
          │                  │                      │
          │                  │ claude -p            │
          │                  ▼                      │
          │         ┌─────────────────┐             │
          │         │  Claude CLI     │             │
          │         │  (headless)     │             │
          │         └─────────────────┘             │
          │                  │                      │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL 16 (Prisma ORM)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Tenants  │  │ Projects │  │ Demands  │  │ AgentLogs│        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                  │
│  Multi-tenant filtering via Prisma middleware (tenantId)        │
└─────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Next.js Frontend** | UI rendering, user input, state management via TanStack Query | Fastify API (REST) |
| **Fastify API** | HTTP endpoints, auth (JWT), business logic orchestration | PostgreSQL (Prisma), Redis (BullMQ), Workers |
| **Prisma ORM** | Database queries, multi-tenant filtering, migrations | PostgreSQL |
| **BullMQ Queue** | Job persistence, scheduling, retry logic, concurrency control | Redis, Workers |
| **BullMQ Workers** | Agent execution, phase-specific logic, Git operations | Claude CLI, PostgreSQL (logs), GitHub API |
| **Claude CLI** | AI agent execution in headless mode (`claude -p`) | Anthropic API (Claude), local filesystem (repos) |
| **PostgreSQL** | Data persistence (tenants, projects, demands, logs) | Prisma ORM |
| **Redis** | Job queue backend, future caching/sessions | BullMQ |

### Data Flow

**Demand Creation Flow:**
```
User → Dashboard → Next.js
               → POST /api/demands
                       → Fastify validates (Zod schema)
                       → Prisma creates Demand (status: inbox, tenantId filtered)
                       → BullMQ enqueue Discovery job
                       → Response to Next.js
                       → Optimistic update in TanStack Query cache
```

**Agent Execution Flow (Discovery Phase Example):**
```
BullMQ Worker picks Discovery job
    → Fetch demand from PostgreSQL (via Prisma)
    → Create prompt for Discovery agent
    → Execute `claude -p "Analyze requirements: <demand text>"`
    → Claude CLI returns JSON output
    → Parse response
    → Update Demand (status: planning, discoveryOutput)
    → Create AgentLog (phase: discovery, tokens, cost, duration)
    → Enqueue Planning job
    → Mark Discovery job complete
```

**Kanban Drag-and-Drop Flow:**
```
User drags Demand card → Inbox to Discovery
    → Optimistic UI update (@dnd-kit)
    → POST /api/demands/:id/move { toPhase: 'discovery' }
        → Fastify validates move (business rules)
        → Prisma update Demand (status: discovery)
        → Enqueue Discovery job if not already running
        → Response
    → TanStack Query invalidates cache
    → Poll refetch shows updated state
```

**3-Tier Merge Flow:**
```
Development agent completes → Creates PR
    → Testing agent validates PR
    → Enqueue Merge job
    → Merge Worker:
        Tier 1: CI green? → auto-merge → Done
        Tier 2: Conflicts? → `claude -p "Resolve conflicts: <diff>"` → retry merge → Done
        Tier 3: AI fails? → Update Demand (status: merge_conflict, requiresHuman: true) → Notify user
```

## Patterns to Follow

### Pattern 1: Multi-Tenant Isolation via Prisma Middleware

**What:** Automatically inject `tenantId` filter on all database queries to prevent cross-tenant data leaks.

**When:** Every database query. No exceptions.

**Example:**
```typescript
// packages/shared/src/prisma.ts
import { PrismaClient } from '@prisma/client'

export const createPrismaClient = (tenantId: string) => {
  const prisma = new PrismaClient()

  // Global middleware for read isolation
  prisma.$use(async (params, next) => {
    const modelsWithTenantId = ['Project', 'Demand', 'User', 'AgentLog']

    if (modelsWithTenantId.includes(params.model || '')) {
      if (params.action === 'findMany' || params.action === 'findFirst' || params.action === 'findUnique') {
        params.args.where = { ...params.args.where, tenantId }
      }

      if (params.action === 'create' || params.action === 'createMany') {
        if (Array.isArray(params.args.data)) {
          params.args.data = params.args.data.map((item: any) => ({ ...item, tenantId }))
        } else {
          params.args.data = { ...params.args.data, tenantId }
        }
      }

      if (params.action === 'update' || params.action === 'updateMany' || params.action === 'delete' || params.action === 'deleteMany') {
        params.args.where = { ...params.args.where, tenantId }
      }
    }

    return next(params)
  })

  return prisma
}

// Usage in Fastify route
fastify.decorateRequest('prisma', null)
fastify.addHook('onRequest', async (request, reply) => {
  const tenantId = request.user.tenantId // from JWT
  request.prisma = createPrismaClient(tenantId)
})
```

**Why:** Enforces tenant isolation at ORM level, not application level. Impossible to forget filtering. Defense-in-depth.

### Pattern 2: BullMQ Concurrency Control per Project

**What:** Limit concurrent Development jobs to 3 per project using BullMQ concurrency groups.

**When:** Job queue configuration for Development phase workers.

**Example:**
```typescript
// apps/api/src/workers/development-worker.ts
import { Worker } from 'bullmq'

const developmentWorker = new Worker(
  'development-queue',
  async (job) => {
    const { demandId, projectId } = job.data

    // Execute Development agent
    const result = await executeDevelopmentAgent(demandId)

    return result
  },
  {
    connection: redisConnection,
    concurrency: 3, // Max 3 concurrent jobs across ALL projects

    // Group by projectId to ensure max 3 per project
    // BullMQ 5.x supports groups for this
    limiter: {
      max: 3,
      duration: 1000,
      groupKey: 'projectId' // Custom group key from job.data.projectId
    }
  }
)

// When enqueueing Development jobs
await developmentQueue.add('develop', {
  demandId: 'demand_123',
  projectId: 'project_456'
}, {
  jobId: `develop-${demandId}`, // Prevent duplicate jobs
  removeOnComplete: 100, // Keep last 100 completed jobs for metrics
  removeOnFail: false // Keep failed jobs for debugging
})
```

**Why:** Prevents merge conflict explosion. 3 concurrent branches per project is manageable, 10+ is chaos. BullMQ handles queueing and fair scheduling.

### Pattern 3: Polling-First with TanStack Query

**What:** Use `refetchInterval` for real-time-ish updates without WebSocket complexity.

**When:** MVP phase. Migrate to WebSocket post-validation.

**Example:**
```typescript
// apps/web/src/hooks/useDemands.ts
import { useQuery } from '@tanstack/react-query'

export const useDemands = (projectId: string) => {
  return useQuery({
    queryKey: ['demands', projectId],
    queryFn: () => api.getDemands(projectId),
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 3000, // Consider data stale after 3s
    enabled: !!projectId // Only poll when projectId exists
  })
}

// Demand detail page (faster polling for active demand)
export const useDemandDetail = (demandId: string) => {
  return useQuery({
    queryKey: ['demand', demandId],
    queryFn: () => api.getDemand(demandId),
    refetchInterval: (data) => {
      // Adaptive polling: faster when demand is active (not inbox/done)
      const activePhases = ['discovery', 'planning', 'development', 'testing', 'merge']
      return activePhases.includes(data?.status) ? 2000 : 10000
    }
  })
}
```

**Why:** Simpler than WebSocket for MVP. TanStack Query handles polling, caching, deduplication. Upgrade path exists (add WebSocket, remove refetchInterval).

### Pattern 4: Zod Schema Sharing (packages/shared)

**What:** Single source of truth for validation schemas shared between frontend and backend.

**When:** All API payloads, form validation, Prisma type augmentation.

**Example:**
```typescript
// packages/shared/src/schemas/demand.schema.ts
import { z } from 'zod'

export const demandCreateSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10),
  projectId: z.string().cuid()
})

export const demandUpdateSchema = demandCreateSchema.partial()

export const demandStatusSchema = z.enum([
  'inbox', 'discovery', 'planning', 'development', 'testing', 'merge', 'done'
])

export type DemandCreate = z.infer<typeof demandCreateSchema>
export type DemandStatus = z.infer<typeof demandStatusSchema>

// Backend usage (Fastify)
import { demandCreateSchema } from '@acme/shared/schemas/demand.schema'

fastify.post('/api/demands', async (request, reply) => {
  const data = demandCreateSchema.parse(request.body) // Throws on validation error
  // ...
})

// Frontend usage (react-hook-form)
import { demandCreateSchema } from '@acme/shared/schemas/demand.schema'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

const form = useForm<DemandCreate>({
  resolver: zodResolver(demandCreateSchema)
})
```

**Why:** Eliminates schema drift between frontend and backend. Type safety across monorepo. Single schema update propagates everywhere.

### Pattern 5: Agent as Child Process (Isolation)

**What:** Execute `claude -p` as isolated child process, not in-process API calls.

**When:** All agent executions (Discovery, Planning, Development, Testing, Merge).

**Example:**
```typescript
// apps/api/src/agents/executor.ts
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function executeAgent(phase: string, prompt: string, workingDir: string) {
  const startTime = Date.now()

  try {
    // Execute Claude CLI in headless mode
    const { stdout, stderr } = await execAsync(
      `claude -p "${prompt.replace(/"/g, '\\"')}"`,
      {
        cwd: workingDir,
        timeout: 600000, // 10 minute timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
      }
    )

    const duration = Date.now() - startTime
    const result = JSON.parse(stdout)

    return {
      success: true,
      output: result,
      duration,
      tokens: result.usage?.total_tokens || 0,
      cost: calculateCost(result.usage)
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    }
  }
}

// BullMQ worker usage
developmentWorker.process(async (job) => {
  const { demandId, projectId } = job.data

  const demand = await prisma.demand.findUnique({ where: { id: demandId } })
  const project = await prisma.project.findUnique({ where: { id: projectId } })

  const workingDir = `/tmp/repos/${projectId}/${demandId}`
  const prompt = buildDevelopmentPrompt(demand, project)

  const result = await executeAgent('development', prompt, workingDir)

  // Log result to database
  await prisma.agentLog.create({
    data: {
      demandId,
      phase: 'development',
      tokens: result.tokens,
      cost: result.cost,
      duration: result.duration,
      output: result.output,
      success: result.success
    }
  })

  return result
})
```

**Why:** Process isolation prevents memory leaks, timeout control, resource limits. Claude CLI handles API retries, rate limiting, error handling internally.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Direct Anthropic SDK Calls in API Routes

**What:** Calling Anthropic API directly from Fastify route handlers.

**Why bad:** Ties up HTTP request while agent executes (30s-10min). Timeout issues. No retry logic. No concurrency control.

**Instead:** Enqueue BullMQ job, return immediately with `jobId`. Client polls for result.

```typescript
// ❌ BAD: Blocks HTTP request
fastify.post('/api/demands/:id/discover', async (request, reply) => {
  const result = await anthropic.messages.create({ /* ... */ }) // 2 minutes of waiting
  return result // Request times out
})

// ✅ GOOD: Async job
fastify.post('/api/demands/:id/discover', async (request, reply) => {
  const job = await discoveryQueue.add('discover', { demandId: request.params.id })
  return { jobId: job.id, status: 'queued' } // Returns in <100ms
})
```

### Anti-Pattern 2: Tenant Filtering in Application Code

**What:** Manually adding `where: { tenantId }` to every Prisma query.

**Why bad:** Easy to forget. Security vulnerability. Code duplication.

**Instead:** Use Prisma middleware (Pattern 1) to inject `tenantId` globally.

### Anti-Pattern 3: Storing Agent Output in Redis

**What:** Using Redis as primary storage for agent results to avoid PostgreSQL writes.

**Why bad:** Redis is ephemeral (data loss on restart). No audit trail. Can't query historical data. Metrics/analytics impossible.

**Instead:** Store all agent outputs in PostgreSQL. Use Redis only for BullMQ job queue (designed for transient data).

### Anti-Pattern 4: Single BullMQ Queue for All Phases

**What:** One queue `agent-queue` for Discovery, Planning, Development, Testing, Merge.

**Why bad:** Can't apply phase-specific concurrency limits. Discovery can run 10 concurrent, Development only 3. Single queue = single concurrency setting.

**Instead:** Separate queues per phase: `discovery-queue` (concurrency: 10), `development-queue` (concurrency: 3, grouped by project).

### Anti-Pattern 5: Real-Time WebSocket from Day 1

**What:** Implementing WebSocket for real-time Kanban updates in MVP.

**Why bad:** Complex setup (connection state, reconnection, broadcasting). Overkill for 5s polling. Delays launch.

**Instead:** Start with TanStack Query polling (Pattern 3). Add WebSocket post-MVP when needed.

## Scalability Considerations

| Concern | At 100 users (MVP) | At 10K users | At 1M users |
|---------|-------------------|--------------|-------------|
| **Database Connections** | Prisma default pool (10 connections) | Connection pooling via PgBouncer (100 connections) | Read replicas, connection pooling, sharding by tenantId |
| **BullMQ Workers** | Single worker instance per phase (3-5 workers) | Horizontal scaling: 10+ worker instances per phase | Separate worker clusters per tenant/region, auto-scaling |
| **Redis** | Single Redis instance (Docker) | Redis Sentinel (HA setup) | Redis Cluster (sharded), separate cache + queue instances |
| **Claude API Rate Limits** | Anthropic Tier 1 (50 req/min) | Tier 2+ (200+ req/min), request queuing | Enterprise plan, multiple API keys, load balancing |
| **Frontend Polling** | 5s polling for all users (20 req/min per user) | 10s polling, WebSocket for active sessions | WebSocket only, event-driven updates, no polling |
| **Job Queue Throughput** | 10-20 jobs/min | 100+ jobs/min, separate Redis for queue | 1000+ jobs/min, partitioned queues, priority lanes |
| **Git Repository Access** | Shared `/tmp/repos` directory | Separate disk volumes per worker | Distributed file system (S3 + ephemeral workers), containerized workers |

**MVP Focus:** Vertical scaling (bigger PostgreSQL/Redis instances) before horizontal scaling.

**Post-MVP:** Horizontal scaling of workers, read replicas, caching layer (Redis), WebSocket migration.

## Deployment Architecture (Future)

**MVP:** Local development (Docker Compose)

**Production (Phase 2):**
```
┌─────────────────────────────────────────────────────────────────┐
│                         Load Balancer (Nginx)                    │
└─────────────────────────────────────────────────────────────────┘
          │                                  │
          ▼                                  ▼
┌──────────────────────┐          ┌──────────────────────┐
│   Next.js Frontend   │          │   Fastify API        │
│   (Vercel/VPS)       │          │   (VPS/Container)    │
│   Static + SSR       │          │   Multiple instances │
└──────────────────────┘          └──────────────────────┘
                                            │
                  ┌─────────────────────────┼─────────────────────────┐
                  ▼                         ▼                         ▼
          ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
          │ PostgreSQL  │          │   Redis     │          │ BullMQ      │
          │ (Managed)   │          │ (Managed)   │          │ Workers     │
          │ Supabase/   │          │ Upstash/    │          │ (Containers)│
          │ Railway     │          │ Railway     │          │ Scalable    │
          └─────────────┘          └─────────────┘          └─────────────┘
```

**Key decisions:**
- Next.js → Vercel (zero-config SSR) or VPS (cost control)
- Fastify API → VPS containers (DigitalOcean, Hetzner, Railway)
- PostgreSQL → Managed service (Supabase, Railway, RDS)
- Redis → Managed service (Upstash, Railway, ElastiCache)
- BullMQ Workers → Separate containers (can scale independently)

## Security Architecture

### Authentication Flow

```
User login → POST /api/auth/login
         → Fastify validates credentials (bcrypt)
         → Generate JWT with { userId, tenantId, email }
         → Return { token, refreshToken }
         → Client stores in httpOnly cookie (Next.js middleware)
         → Subsequent requests include cookie
         → Fastify verifies JWT (@fastify/jwt)
         → Inject user context into request.user
         → Prisma middleware filters by request.user.tenantId
```

### Multi-Tenant Security

**Defense-in-depth layers:**
1. **Row-level isolation:** Prisma middleware enforces `tenantId` filter
2. **API validation:** All routes validate user has access to requested project/demand
3. **Database indexes:** `@@index([tenantId])` on all multi-tenant tables for performance
4. **JWT claims:** `tenantId` in token payload, verified on every request
5. **Rate limiting:** Per-tenant rate limits to prevent one tenant DoS-ing others

### Secrets Management

```
Environment variables (.env) → Never commit to Git
    → Local dev: .env.local
    → Production: Platform env vars (Vercel, Railway)
    → Secrets:
        - DATABASE_URL
        - REDIS_URL
        - JWT_SECRET
        - ANTHROPIC_API_KEY
        - GITHUB_TOKEN (per project, encrypted in DB)
```

**Encrypt GitHub tokens in database:**
```typescript
// packages/shared/src/crypto.ts
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY // 32-byte key
const ALGORITHM = 'aes-256-gcm'

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`
}

export function decrypt(encryptedText: string): string {
  const [ivHex, encryptedHex, authTagHex] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

// Store encrypted, decrypt on use
await prisma.project.update({
  where: { id: projectId },
  data: { githubToken: encrypt(token) }
})

const project = await prisma.project.findUnique({ where: { id: projectId } })
const token = decrypt(project.githubToken)
```

## Monitoring & Observability (Future)

**MVP:** Pino structured logging (JSON logs)

**Post-MVP:**
- **APM:** Sentry for error tracking, performance monitoring
- **Metrics:** Prometheus + Grafana for system health (job queue length, agent execution time, API latency)
- **Logs:** Centralized logging (Logtail, Datadog) with correlation IDs (trace agent execution across services)
- **Alerts:** PagerDuty/Slack alerts for job failures, API downtime, cost spikes

## Sources

**Architecture Patterns:**
- Multi-tenant SaaS design patterns (training data)
- BullMQ documentation patterns (job queue concurrency, grouping)
- Prisma middleware patterns (global filtering)
- Next.js + Fastify separation patterns (monorepo architecture)

**Project Context:**
- E:/DEV/BEETHETECH/TechTeam/.planning/PROJECT.md (requirements, constraints, decisions)
- User-specified stack (Next.js 15, Fastify, Prisma, BullMQ, Turborepo)

**Confidence:** MEDIUM
- Architecture aligns with stated stack (HIGH confidence)
- Multi-tenant patterns well-established (MEDIUM confidence)
- BullMQ concurrency grouping requires verification (MEDIUM confidence)
- Scalability numbers are estimates (LOW-MEDIUM confidence)

**Validation Required:**
- BullMQ 5.x support for concurrency groups (verify official docs)
- Prisma middleware performance at scale (benchmark multi-tenant filtering)
- Claude CLI process isolation best practices (verify resource limits)

---

*Architecture research for: AI Agent Orchestration Platform*
*Researched: 2026-02-11*
*Confidence: MEDIUM (patterns validated, versions require 2026 verification)*
