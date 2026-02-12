# Phase 3: Agent Pipeline - Research

**Researched:** 2026-02-12
**Domain:** BullMQ job queue, Claude Agent SDK (TypeScript), AI agent orchestration, structured JSON output, agent execution tracking
**Confidence:** HIGH

## Summary

Phase 3 transforms the TechTeam platform from a manual Kanban board into an AI-powered pipeline where demands automatically progress through Discovery and Planning phases. The architecture centers on three pillars: (1) BullMQ as the job queue connecting demand stage transitions to agent execution, (2) the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) for programmatic AI agent invocation with structured JSON output and built-in token/cost tracking, and (3) a new `AgentRun` database model that records every execution with full observability (tokens, cost, duration, status).

The key architectural insight is that the Claude Agent SDK provides a native TypeScript `query()` function that returns an `SDKResultMessage` containing `total_cost_usd`, `usage` (input/output tokens), and `duration_ms` directly -- eliminating the need to parse CLI stdout or manage child processes. The SDK also supports `--json-schema` / `outputFormat` for guaranteed structured output matching Zod schemas, which maps perfectly to the Discovery (requirements JSON, complexity) and Planning (task decomposition JSON) agent outputs. This is significantly more reliable than shelling out to `claude -p` and parsing text output.

BullMQ v5.67.x provides built-in exponential backoff retry (`attempts: 3, backoff: { type: 'exponential', delay: 1000 }`), worker events for tracking job lifecycle, and QueueEvents for centralized monitoring via Redis streams. Redis 7 is already running in Docker Compose on port 6380, and the API config already has `REDIS_URL` defined. The worker process can run as a separate entry point in the API package or as its own package, sharing the same Prisma client and tenant isolation.

**Primary recommendation:** Use `@anthropic-ai/claude-agent-sdk` (TypeScript SDK) with `query()` + `outputFormat: { type: 'json_schema', schema }` for agent execution, BullMQ v5.x for job queuing with exponential backoff, and a new `AgentRun` Prisma model for execution tracking. Workers run as a separate process entry point in `apps/api` sharing the existing database package.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | ^5.67.0 | Job queue with retry, backoff, events, Redis-backed persistence | Industry standard for Node.js job queues. Built-in exponential backoff, stalled job detection, QueueEvents via Redis streams. Used in production by major platforms. |
| @anthropic-ai/claude-agent-sdk | ^0.2.12 | Programmatic Claude Code agent invocation with structured outputs | Official Anthropic SDK. Returns `SDKResultMessage` with `total_cost_usd`, `usage`, `duration_ms`. Supports `outputFormat` with JSON Schema for guaranteed structured output. Replaces need for `claude -p` CLI shelling. |
| ioredis | ^5.x | Redis client (BullMQ peer dependency) | BullMQ's underlying Redis driver. Required for connection configuration. Already a transitive dependency. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.24.0 (already installed) | Define agent output schemas, convert to JSON Schema via `z.toJSONSchema()` | Define Discovery output schema (requirements, complexity) and Planning output schema (tasks, files). SDK validates output against schema automatically. |
| @techteam/database (workspace) | workspace:* | Prisma client with tenant isolation | AgentRun model, Demand updates. Workers use `forTenant()` for tenant-scoped writes. |
| @techteam/shared (workspace) | workspace:* | Shared Zod schemas and types | Agent output type definitions shared between API, worker, and web. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/claude-agent-sdk` (TypeScript SDK) | `claude -p` CLI via `child_process.spawn` | CLI approach requires parsing stdout, managing child processes, extracting token counts from text output. SDK gives typed `SDKResultMessage` with `total_cost_usd`, `usage`, `duration_ms` natively. SDK is clearly superior for programmatic use. |
| BullMQ | Agenda.js / pg-boss | Agenda uses MongoDB (not in stack). pg-boss uses PostgreSQL (possible but BullMQ has richer features, better docs, and Redis is already in Docker Compose). |
| Separate worker process | In-process worker (same Fastify server) | In-process risks blocking the API event loop during agent execution. Separate process is standard pattern: independent scaling, crash isolation, dedicated resources. |
| BullMQ Flows (parent-child) | Simple sequential jobs | Flows add complexity not needed yet. Discovery and Planning are sequential per-demand. Simple job chaining (Discovery completion triggers Planning job) is simpler and sufficient. |

**Installation:**
```bash
cd apps/api && pnpm add bullmq @anthropic-ai/claude-agent-sdk ioredis
```

## Architecture Patterns

### Recommended Project Structure

```
apps/api/
  src/
    queues/                  # Queue definitions and job types
      agent.queue.ts         # Queue instance, job type definitions
      agent.worker.ts        # Worker entry point (separate process)
    agents/                  # Agent execution logic
      base-agent.ts          # Shared agent execution wrapper
      discovery.agent.ts     # Discovery phase agent (prompts, schema)
      planning.agent.ts      # Planning phase agent (prompts, schema)
    routes/
      demands.ts             # Extended: trigger job on stage change to discovery
      agent-runs.ts          # NEW: API to list agent runs for a demand
    lib/
      redis.ts               # Redis connection factory (shared between queue/worker)
      config.ts              # Extended: ANTHROPIC_API_KEY, CLAUDE_MODEL
  worker.ts                  # Worker process entry point (tsx watch)
packages/database/
  prisma/
    schema.prisma            # Extended: AgentRun model
packages/shared/
  src/
    schemas/
      agent.ts               # Agent output Zod schemas (discovery, planning)
    types/
      index.ts               # Extended: AgentRun type
apps/web/
  src/
    components/demands/
      demand-detail.tsx       # Extended: show requirements, plan, agent runs
      agent-run-list.tsx      # NEW: list of agent runs with tokens/cost/duration
```

### Pattern 1: Job Queue Trigger on Stage Transition

**What:** When a demand's stage changes to `discovery`, enqueue a BullMQ job. When Discovery completes, enqueue Planning. When Planning completes, advance to `development` (parked for Phase 4).

**When to use:** Every stage transition that triggers agent work.

**Example:**
```typescript
// apps/api/src/queues/agent.queue.ts
import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis.js';

export const agentQueue = new Queue('agent-pipeline', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// Job data type
export interface AgentJobData {
  demandId: string;
  tenantId: string;
  projectId: string;
  phase: 'discovery' | 'planning';
}
```

```typescript
// In demands route - PATCH /:id/stage handler
if (parsed.data.stage === 'discovery') {
  await agentQueue.add('run-agent', {
    demandId: id,
    tenantId: request.session!.session.activeOrganizationId,
    projectId: demand.projectId,
    phase: 'discovery',
  });
}
```

### Pattern 2: Worker Process with Agent SDK

**What:** A separate Node.js process runs the BullMQ Worker, executes Claude agents via the SDK, and writes results to the database.

**When to use:** The worker process pattern for all agent execution.

**Example:**
```typescript
// apps/api/src/queues/agent.worker.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { runDiscoveryAgent } from '../agents/discovery.agent.js';
import { runPlanningAgent } from '../agents/planning.agent.js';
import type { AgentJobData } from './agent.queue.js';

const PHASE_TIMEOUTS: Record<string, number> = {
  discovery: 2 * 60 * 1000,   // 2 minutes
  planning: 5 * 60 * 1000,    // 5 minutes
};

const worker = new Worker<AgentJobData>(
  'agent-pipeline',
  async (job: Job<AgentJobData>) => {
    const { demandId, tenantId, projectId, phase } = job.data;

    const agentFn = phase === 'discovery' ? runDiscoveryAgent : runPlanningAgent;
    const result = await agentFn({
      demandId,
      tenantId,
      projectId,
      timeout: PHASE_TIMEOUTS[phase],
    });

    return result;
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);

// CRITICAL: Always attach error handler
worker.on('error', (err) => {
  console.error('Worker error:', err);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, closing worker...`);
  await worker.close();
  process.exit(0);
};
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
```

### Pattern 3: Agent Execution with Claude Agent SDK

**What:** Use `@anthropic-ai/claude-agent-sdk` `query()` function with `outputFormat` for structured output, `AbortController` for timeouts, and extract token/cost data from `SDKResultMessage`.

**When to use:** Every agent invocation.

**Example:**
```typescript
// apps/api/src/agents/discovery.agent.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { prisma } from '@techteam/database';

// Zod schema for Discovery output
const discoveryOutputSchema = z.object({
  functionalRequirements: z.array(z.object({
    id: z.string(),
    description: z.string(),
    acceptance: z.string(),
  })),
  nonFunctionalRequirements: z.array(z.object({
    id: z.string(),
    category: z.string(),
    description: z.string(),
  })),
  complexity: z.enum(['S', 'M', 'L', 'XL']),
  ambiguities: z.array(z.object({
    question: z.string(),
    context: z.string(),
  })),
  summary: z.string(),
});

export type DiscoveryOutput = z.infer<typeof discoveryOutputSchema>;

export async function runDiscoveryAgent(params: {
  demandId: string;
  tenantId: string;
  projectId: string;
  timeout: number;
}) {
  const { demandId, tenantId, projectId, timeout } = params;

  // Fetch demand + project data for context
  const demand = await prisma.demand.findUnique({ where: { id: demandId } });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!demand || !project) throw new Error('Demand or project not found');

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeout);

  const startedAt = Date.now();
  let resultMessage: any = null;

  try {
    for await (const message of query({
      prompt: buildDiscoveryPrompt(demand, project),
      options: {
        abortController,
        model: 'sonnet',
        maxTurns: 3,
        outputFormat: {
          type: 'json_schema',
          schema: z.toJSONSchema(discoveryOutputSchema),
        },
        tools: [], // Discovery agent doesn't need file tools
        permissionMode: 'bypassPermissions',
      },
    })) {
      if (message.type === 'result') {
        resultMessage = message;
      }
    }
  } finally {
    clearTimeout(timer);
  }

  if (!resultMessage) throw new Error('No result from agent');

  const durationMs = resultMessage.duration_ms;
  const tokensIn = resultMessage.usage.input_tokens;
  const tokensOut = resultMessage.usage.output_tokens;
  const costUsd = resultMessage.total_cost_usd;

  // Parse structured output
  const output = discoveryOutputSchema.parse(resultMessage.structured_output);

  // Create AgentRun record
  await prisma.agentRun.create({
    data: {
      demandId,
      tenantId,
      phase: 'discovery',
      status: 'completed',
      tokensIn,
      tokensOut,
      costUsd,
      durationMs,
      output: output as any,
    },
  });

  // Update demand with results
  const hasAmbiguities = output.ambiguities.length > 0;

  await prisma.demand.update({
    where: { id: demandId },
    data: {
      requirements: output as any,
      complexity: output.complexity,
      totalTokens: { increment: tokensIn + tokensOut },
      totalCostUsd: { increment: costUsd },
      ...(hasAmbiguities
        ? { stage: 'discovery' } // Stay in discovery, paused
        : { stage: 'planning' } // Auto-advance
      ),
    },
  });

  // If no ambiguities, enqueue planning job
  if (!hasAmbiguities) {
    const { agentQueue } = await import('../queues/agent.queue.js');
    await agentQueue.add('run-agent', {
      demandId,
      tenantId,
      projectId,
      phase: 'planning',
    });
  }

  return { output, hasAmbiguities };
}
```

### Pattern 4: Redis Connection Factory

**What:** Centralized Redis connection creation shared between Queue and Worker instances.

**When to use:** Always -- single source of truth for Redis config.

**Example:**
```typescript
// apps/api/src/lib/redis.ts
import IORedis from 'ioredis';
import { config } from './config.js';

// For Queue instances (producers) -- use default maxRetriesPerRequest
export const redisConnection = new IORedis(config.REDIS_URL);

// For Worker instances -- must set maxRetriesPerRequest to null
export function createWorkerConnection() {
  return new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}
```

### Pattern 5: AgentRun Database Model

**What:** A new Prisma model to track every agent execution with tokens, cost, duration, status, and output.

**When to use:** Created on every agent invocation, queried on demand detail page.

**Example:**
```prisma
model AgentRun {
  id         String       @id @default(cuid())
  tenantId   String
  demandId   String
  phase      DemandStage  // discovery, planning, development, testing, merge
  status     AgentStatus
  tokensIn   Int          @default(0)
  tokensOut  Int          @default(0)
  costUsd    Float        @default(0)
  durationMs Int          @default(0)
  output     Json?
  error      String?      @db.Text
  attempt    Int          @default(1)
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  demand     Demand       @relation(fields: [demandId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([demandId])
  @@index([demandId, phase])
}

enum AgentStatus {
  queued
  running
  completed
  failed
  timeout
  paused
}
```

### Anti-Patterns to Avoid

- **In-process agent execution:** Never run Claude agents inside the Fastify request handler. Agent calls take 30s-5min and would block the API event loop. Always use BullMQ workers in a separate process.
- **Polling for job completion from the frontend:** Do not have the frontend poll the BullMQ queue directly. Instead, write results to the database and let the existing 5s TanStack Query polling pick up demand changes naturally.
- **Shared IORedis connection between Queue and Worker:** Workers need `maxRetriesPerRequest: null` but Queues should use the default. Create separate connections.
- **Using `claude -p` CLI via child_process:** The TypeScript Agent SDK provides typed results, structured output validation, and token/cost tracking natively. Shelling out to the CLI loses type safety and requires manual output parsing.
- **Storing ANTHROPIC_API_KEY in code or repo:** Must be in `.env` only. The Agent SDK reads it from `process.env.ANTHROPIC_API_KEY` automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job retry with exponential backoff | Custom retry loop with setTimeout | BullMQ `attempts: 3, backoff: { type: 'exponential', delay: 1000 }` | Edge cases: Redis disconnects during retry, process crashes between retries, concurrent retry attempts. BullMQ handles all of these with atomic Redis operations. |
| Structured AI output parsing | Manual JSON.parse + regex extraction from text output | Claude Agent SDK `outputFormat: { type: 'json_schema', schema }` | Schema validation, retry on invalid output, guaranteed structure. SDK retries internally if output doesn't match schema. |
| Job timeout | Custom setTimeout + process.kill | AbortController pattern with SDK's `abortController` option | Clean cancellation of async generators, proper resource cleanup, avoids orphaned processes. |
| Token/cost tracking | Parse `claude -p` stdout for usage stats | SDK's `SDKResultMessage.total_cost_usd`, `.usage`, `.duration_ms` | Typed fields, always present on result, per-model breakdown via `modelUsage`. |
| Stalled job detection | Heartbeat mechanism with custom timers | BullMQ's built-in stall detection (`stalledInterval: 30000`, `maxStalledCount: 1`) | Atomic Redis operations ensure consistency even across process crashes. |
| Job lifecycle events | Custom database polling for job status | BullMQ QueueEvents (Redis streams) | Guaranteed event delivery even across disconnections. Events include `completed`, `failed`, `progress`, `stalled`. |

**Key insight:** The combination of BullMQ (job orchestration) and Claude Agent SDK (agent execution) covers almost the entire infrastructure requirement. Custom code should focus on prompt engineering, output schema design, and the stage-transition business logic -- not on queue mechanics or AI invocation plumbing.

## Common Pitfalls

### Pitfall 1: Worker maxRetriesPerRequest Not Set to null

**What goes wrong:** Worker throws `MaxRetriesPerRequestError` during normal operation, causing all jobs to fail.
**Why it happens:** BullMQ workers use blocking Redis commands (`BRPOPLPUSH`). IORedis defaults `maxRetriesPerRequest` to 20, which triggers errors on long-running blocking calls.
**How to avoid:** Always create worker connections with `maxRetriesPerRequest: null`. Use separate connections for Queue (default) and Worker (null).
**Warning signs:** Jobs fail with Redis connection errors despite Redis being healthy.

### Pitfall 2: Missing Worker Error Handler

**What goes wrong:** Worker silently stops processing jobs after an unhandled error.
**Why it happens:** Node.js EventEmitter crashes on unhandled `error` events. BullMQ docs explicitly warn: "If the error handler is missing, your worker may stop processing jobs when an error is emitted!"
**How to avoid:** Always attach `worker.on('error', (err) => { ... })` immediately after creating the worker.
**Warning signs:** Worker appears running but no jobs are being processed. No error logs.

### Pitfall 3: Agent Timeout Not Implemented

**What goes wrong:** A discovery agent call that hits an API error or infinite loop runs forever, blocking the worker.
**Why it happens:** BullMQ has stalled job detection (30s default) but this doesn't kill the process -- it just marks the job as stalled. The actual agent invocation needs explicit timeout.
**How to avoid:** Use `AbortController` with `setTimeout` passed to the SDK `query()` options. Wrap in try/catch and throw `UnrecoverableError` on timeout to prevent retries.
**Warning signs:** Worker concurrency drops to 0 as all slots are occupied by hung jobs.

### Pitfall 4: Redis maxmemory-policy Not Set to noeviction

**What goes wrong:** Redis silently evicts BullMQ keys when memory is full, causing jobs to disappear or get stuck.
**Why it happens:** Redis defaults to `noeviction` for standalone but some managed Redis services default to `allkeys-lru`.
**How to avoid:** Ensure Redis is configured with `maxmemory-policy=noeviction`. Add to Docker Compose redis command: `redis-server --appendonly yes --maxmemory-policy noeviction`.
**Warning signs:** Jobs disappear from queue without being processed or failing.

### Pitfall 5: Not Handling SDK Structured Output Failures

**What goes wrong:** Agent completes but output doesn't match schema, resulting in `null` structured_output.
**Why it happens:** Complex schemas can be hard for the model to satisfy. The SDK retries internally but may eventually return `error_max_structured_output_retries` subtype.
**How to avoid:** Check `resultMessage.subtype === 'success'` before accessing `structured_output`. Keep schemas focused (not deeply nested). Make optional fields truly optional.
**Warning signs:** AgentRun records with `status: 'failed'` and error "Could not produce valid output".

### Pitfall 6: Tenant Isolation in Workers

**What goes wrong:** Agent runs access or modify data belonging to other tenants.
**Why it happens:** Workers don't have the Fastify request context that provides `request.prisma`. Raw `prisma` client has no tenant filtering.
**How to avoid:** Pass `tenantId` in the job data. In the worker, use `forTenant(tenantId)` to create a tenant-scoped Prisma client for all database operations.
**Warning signs:** Data leaks between organizations. Demands showing runs from other tenants.

## Code Examples

### Complete Queue + Worker Setup

```typescript
// apps/api/src/lib/redis.ts
// Source: BullMQ official docs (https://docs.bullmq.io/guide/connections)
import IORedis from 'ioredis';
import { config } from './config.js';

export function createQueueConnection() {
  return new IORedis(config.REDIS_URL);
}

export function createWorkerConnection() {
  return new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}
```

### Agent Output Schema with Zod

```typescript
// packages/shared/src/schemas/agent.ts
import { z } from 'zod';

// Discovery agent output schema
export const discoveryOutputSchema = z.object({
  functionalRequirements: z.array(z.object({
    id: z.string(),
    description: z.string(),
    acceptance: z.string(),
  })),
  nonFunctionalRequirements: z.array(z.object({
    id: z.string(),
    category: z.enum(['performance', 'security', 'usability', 'reliability', 'maintainability']),
    description: z.string(),
  })),
  complexity: z.enum(['S', 'M', 'L', 'XL']),
  ambiguities: z.array(z.object({
    question: z.string(),
    context: z.string(),
  })),
  summary: z.string(),
});

// Planning agent output schema
export const planningOutputSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    type: z.enum(['create', 'modify', 'delete', 'test', 'config']),
    files: z.array(z.object({
      path: z.string(),
      action: z.enum(['create', 'modify', 'delete']),
    })),
    dependencies: z.array(z.string()), // task IDs this depends on
    estimatedComplexity: z.enum(['trivial', 'simple', 'moderate', 'complex']),
  })),
  executionOrder: z.array(z.string()), // ordered task IDs
  riskAreas: z.array(z.string()),
  summary: z.string(),
});

export type DiscoveryOutput = z.infer<typeof discoveryOutputSchema>;
export type PlanningOutput = z.infer<typeof planningOutputSchema>;
```

### SDK Invocation with Timeout and Cost Tracking

```typescript
// Source: Claude Agent SDK docs (https://platform.claude.com/docs/en/agent-sdk/typescript)
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

async function executeAgent(params: {
  prompt: string;
  schema: object;
  timeoutMs: number;
  cwd?: string;
}): Promise<{
  output: unknown;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
}> {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), params.timeoutMs);

  try {
    let result: any = null;

    for await (const message of query({
      prompt: params.prompt,
      options: {
        abortController,
        model: 'sonnet',
        maxTurns: 5,
        outputFormat: {
          type: 'json_schema',
          schema: params.schema,
        },
        cwd: params.cwd,
        tools: [], // restrict tools per agent needs
        permissionMode: 'bypassPermissions',
      },
    })) {
      if (message.type === 'result') {
        result = message;
      }
    }

    if (!result) throw new Error('No result from agent');

    if (result.subtype !== 'success') {
      throw new Error(`Agent failed: ${result.subtype} - ${result.errors?.join(', ')}`);
    }

    return {
      output: result.structured_output,
      tokensIn: result.usage.input_tokens,
      tokensOut: result.usage.output_tokens,
      costUsd: result.total_cost_usd,
      durationMs: result.duration_ms,
    };
  } finally {
    clearTimeout(timer);
  }
}
```

### BullMQ Retry with Exponential Backoff

```typescript
// Source: BullMQ docs (https://docs.bullmq.io/guide/retrying-failing-jobs)
import { Queue } from 'bullmq';

const agentQueue = new Queue('agent-pipeline', {
  connection: createQueueConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s, 2s, 4s
    },
  },
});

// Per-job override for longer phases
await agentQueue.add('run-agent', jobData, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s for planning (longer phase)
  },
});
```

### Worker Event Handling with QueueEvents

```typescript
// Source: BullMQ docs (https://docs.bullmq.io/guide/events)
import { QueueEvents } from 'bullmq';

const queueEvents = new QueueEvents('agent-pipeline', {
  connection: createQueueConnection(),
});

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed:`, returnvalue);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed:`, failedReason);
});

queueEvents.on('stalled', ({ jobId }) => {
  console.warn(`Job ${jobId} stalled -- worker may have crashed`);
});
```

### Graceful Worker Shutdown

```typescript
// Source: BullMQ docs (https://docs.bullmq.io/guide/going-to-production)
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, closing worker...`);
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', { promise, reason });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `claude -p` CLI shelling via `child_process` | `@anthropic-ai/claude-agent-sdk` TypeScript SDK | Nov 2025 (SDK v0.1.x) | Native TypeScript types, structured outputs, token/cost in result message, no stdout parsing needed |
| BullMQ QueueScheduler (stall detection) | Built-in stall detection (no QueueScheduler needed) | BullMQ v2.0+ (2023) | QueueScheduler class deprecated and removed. Stall detection is automatic in workers. |
| Bull (v3) | BullMQ (v5) | 2020+ | BullMQ is the official successor. Better TypeScript, flows, worker patterns, no QueueScheduler needed. |
| Custom JSON parsing of LLM output | SDK `outputFormat` with JSON Schema | Nov 2025 | Guaranteed schema compliance with internal retries. No more regex/parsing failures. |

**Deprecated/outdated:**
- `QueueScheduler`: Removed in BullMQ 2.0+. Do not import or create QueueScheduler instances.
- `bull` package: Legacy predecessor to BullMQ. Use `bullmq` instead.
- `claude -p` for programmatic use: While still functional, the Agent SDK is the recommended programmatic interface per official docs.

## Open Questions

1. **ANTHROPIC_API_KEY provisioning for workers**
   - What we know: The Claude Agent SDK reads `ANTHROPIC_API_KEY` from `process.env` automatically. The worker process needs this env var.
   - What's unclear: Whether the key should be a team API key or individual user keys. For v1, a single platform key is simplest.
   - Recommendation: Add `ANTHROPIC_API_KEY` to `.env` and load it in the worker process via the existing `config.ts` pattern. Single key for v1; per-user keys can be added later.

2. **Worker process hosting in monorepo**
   - What we know: The worker needs to share `@techteam/database` and `@techteam/shared`. It can be a separate entry point in `apps/api` or a new `apps/worker` package.
   - What's unclear: Whether turbo's `dev` script should start the worker alongside the API, or if it should be started separately.
   - Recommendation: Add `worker.ts` entry point in `apps/api` with a separate `dev:worker` script. This shares all dependencies without a new package. Add to turbo pipeline if desired.

3. **Agent model selection (Sonnet vs Opus)**
   - What we know: Discovery and Planning are text-analysis tasks, not code generation. Sonnet is faster and cheaper. Opus is more capable.
   - What's unclear: Whether Sonnet's output quality is sufficient for accurate requirements extraction and task decomposition.
   - Recommendation: Default to `sonnet` for v1 (faster, cheaper). Make configurable via `CLAUDE_MODEL` env var. Can upgrade to `opus` per-phase if quality issues arise.

4. **Ambiguity detection notification mechanism (DISC-04)**
   - What we know: When Discovery detects ambiguity, the demand should pause and the user should be notified.
   - What's unclear: Phase 6 covers notifications. For Phase 3, what's the minimal notification?
   - Recommendation: For Phase 3, set demand stage to `discovery` with a status indicator (e.g., `agentStatus: 'paused'`) and rely on the board UI's 5s polling to show the paused state. Add a `pauseReason` field or store ambiguities in the requirements JSON. Full notification system comes in Phase 6.

5. **Concurrency limits for agent workers**
   - What we know: BullMQ worker `concurrency` option controls how many jobs run simultaneously per worker process. Claude API has rate limits.
   - What's unclear: What's the optimal concurrency? Too high = API rate limits; too low = slow throughput.
   - Recommendation: Start with `concurrency: 2` for the worker. This allows 2 concurrent agent calls while staying well within typical API rate limits. Adjust based on real usage.

## Sources

### Primary (HIGH confidence)
- [BullMQ Official Docs - Quick Start](https://docs.bullmq.io/readme-1) - Queue, Worker, QueueEvents setup
- [BullMQ Official Docs - Workers](https://docs.bullmq.io/guide/workers) - Worker events, autorun, progress
- [BullMQ Official Docs - Retrying Failing Jobs](https://docs.bullmq.io/guide/retrying-failing-jobs) - Exponential backoff, attempts, jitter
- [BullMQ Official Docs - Connections](https://docs.bullmq.io/guide/connections) - IORedis config, maxRetriesPerRequest, connection reuse
- [BullMQ Official Docs - Going to Production](https://docs.bullmq.io/guide/going-to-production) - Graceful shutdown, Redis config, error handling
- [BullMQ Official Docs - Timeout Jobs](https://docs.bullmq.io/patterns/timeout-jobs) - AbortController pattern for job timeouts
- [BullMQ Official Docs - Stalled Jobs](https://docs.bullmq.io/guide/jobs/stalled) - stalledInterval, maxStalledCount, sandboxed processors
- [BullMQ Official Docs - Events](https://docs.bullmq.io/guide/events) - Worker events, QueueEvents, Redis streams
- [Claude Code Docs - Run Programmatically](https://code.claude.com/docs/en/headless) - `-p` flag, `--output-format json`, `--json-schema`
- [Claude Code Docs - CLI Reference](https://code.claude.com/docs/en/cli-reference) - All CLI flags including `--max-turns`, `--model`, `--max-budget-usd`
- [Claude Agent SDK - TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) - `query()`, `SDKResultMessage`, `Options`, `Usage`, `ModelUsage` types
- [Claude Agent SDK - Structured Outputs](https://platform.claude.com/docs/en/agent-sdk/structured-outputs) - `outputFormat`, JSON Schema, Zod integration, error handling

### Secondary (MEDIUM confidence)
- [BullMQ npm](https://www.npmjs.com/package/bullmq) - v5.67.3 latest version confirmed
- [Claude Agent SDK npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) - v0.2.12 latest version confirmed
- [BullMQ GitHub Releases](https://github.com/taskforcesh/bullmq/releases) - Version history, breaking changes

### Tertiary (LOW confidence)
- None. All critical claims verified with official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - BullMQ and Claude Agent SDK are both well-documented, official solutions with verified APIs
- Architecture: HIGH - Worker pattern, job queue trigger, AbortController timeout are all documented best practices from official sources
- Pitfalls: HIGH - All pitfalls sourced from official BullMQ production guide and SDK error handling docs
- Agent output schemas: MEDIUM - Schema design is application-specific and will need iteration based on actual agent output quality

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days -- both libraries are stable with infrequent breaking changes)
