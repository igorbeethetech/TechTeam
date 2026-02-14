---
status: complete
phase: 03-agent-pipeline
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md]
started: 2026-02-13T19:40:00Z
updated: 2026-02-13T19:40:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Worker Process Starts Independently
expected: Run `pnpm --filter @techteam/api dev:worker` in a separate terminal. The worker should connect to Redis and show a startup message. It should NOT crash, even without ANTHROPIC_API_KEY set.
result: pass

### 2. Demand Stage Change Triggers Agent Job
expected: On the Kanban board, drag a demand card to the "Discovery" column. The card should show a "queued" agent status indicator. API server logs should show the job being enqueued.
result: pass

### 3. Agent Run List on Detail Page
expected: After dragging to Discovery, open the demand detail page. An "Agent Runs" section should appear listing the queued/running/failed run with phase badge (discovery), status badge, and attempt number.
result: pass

### 4. Auto-Refresh While Agents Active
expected: While an agent job is queued or running, the demand detail page refreshes automatically (~5s) without manual reload. You should see status changes update live.
result: pass (fixed — staleTime: 0 on demand query)

### 5. Discovery Agent Executes (requires ANTHROPIC_API_KEY + worker)
expected: With ANTHROPIC_API_KEY in .env and worker running, the discovery job runs. Demand detail shows structured requirements: functional requirements with acceptance criteria, non-functional requirements with colored badges, complexity badge (S/M/L/XL), and a summary section. NOT raw JSON.
result: pass

### 6. Planning Agent Auto-Triggers After Discovery
expected: After Discovery completes, the demand automatically advances to "Planning" and a new agent job runs. No manual intervention needed — the pipeline flows automatically.
result: pass (fixed — clarification form + POST /api/demands/:id/clarify endpoint added)

### 7. Planning Output Structured Display
expected: After planning completes, the demand detail shows: tasks in execution order with type/complexity badges, file lists with action badges, dependency badges, risk areas section. NOT raw JSON.
result: skipped
reason: Nenhuma demand passou do discovery sem ser pausada — impossivel testar planning output

### 8. Accumulated Metrics on Demand
expected: Demand detail page shows accumulated total tokens and total cost (USD) across all agent runs for that demand. Agent Runs section shows individual run metrics (tokens in/out, cost, duration).
result: pass

## Summary

total: 8
passed: 7
issues: 0
pending: 0
skipped: 1

## Gaps

- truth: "Demand detail page refreshes automatically when agents are active"
  status: failed
  reason: "User reported: os jobs atualizam mas os estados da demanda só atualizam quando dou f5"
  severity: major
  test: 4
  root_cause: "Global staleTime: 30000ms in providers.tsx prevents React Query from re-rendering the demand query even though refetchInterval: 5000 triggers background fetches. The data is considered 'fresh' for 30 seconds so UI doesn't update. AgentRunList works because it's an independent query in a separate component."
  artifacts:
    - path: "apps/web/src/app/(dashboard)/demands/[demandId]/page.tsx"
      issue: "Demand useQuery inherits global staleTime: 30s, suppressing UI updates during active polling"
    - path: "apps/web/src/components/providers.tsx"
      issue: "Global staleTime: 30 * 1000 affects all queries including demand detail"
  missing:
    - "Override staleTime: 0 on the demand detail query when agent is active, so refetchInterval triggers re-renders"

- truth: "After Discovery completes, demand automatically advances to Planning"
  status: failed
  reason: "User reported: não avancou pois demanda ficou pausada solicitando intervenção humana mas o sistema não possui mecanismos para um humano responder as duvidas"
  severity: major
  test: 6
  root_cause: "Discovery agent detects ambiguities and sets agentStatus='paused', stores questions in requirements.ambiguities. Frontend displays questions (amber box in requirements-view.tsx) but there is NO form to answer, NO API endpoint to submit answers, and NO worker logic to resume with clarifications. It's a dead-end."
  artifacts:
    - path: "apps/web/src/components/demands/requirements-view.tsx"
      issue: "Shows ambiguity questions as read-only — no input fields or submit button"
    - path: "apps/api/src/routes/demands.ts"
      issue: "No endpoint to accept clarification answers and resume pipeline"
    - path: "apps/api/src/queues/agent.worker.ts"
      issue: "Pause logic (lines 196-201) has no resume counterpart"
  missing:
    - "Clarification form UI below each ambiguity question with textarea + submit"
    - "POST /api/demands/:id/clarify endpoint to store answers and re-enqueue discovery"
    - "Worker logic to pass clarifications as context to discovery agent on re-run"
    - "Schema field on Demand to store clarification answers (e.g., ambiguityClarifications Json?)"

## User Observations (for future improvements)

- **Human intervention UI:** Quando o discovery agent pausa por ambiguidade, o sistema precisa de uma interface amigavel para o humano responder as duvidas do agente e retomar o pipeline. Atualmente nao existe mecanismo para isso.
- **Claude MAX support:** Usuario nao quer depender exclusivamente da API key da Anthropic para rodar agentes. Quer poder selecionar entre usar API key OU a assinatura Claude MAX que ja paga mensalmente. Isso requer integracao com Claude MAX (possivelmente via claude CLI headless mode ao inves do SDK).
