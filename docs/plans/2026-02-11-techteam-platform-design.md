# TechTeam Platform — Design Document

## Visao Geral

Plataforma de orquestracao de agentes IA para desenvolvimento de software. Demandas entram via dashboard web, fluem por um pipeline automatizado (Discovery, Planning, Development, Testing, Merge), e agentes Claude executam cada fase autonomamente.

Objetivo final: oferecer como servico (AI Development as a Service) para clientes da Bee The Tech.

---

## Decisoes de Arquitetura

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Frontend | Next.js 15 (App Router) | RSC, layouts, bom DX |
| Backend | Node.js + Fastify (separado) | WebSocket nativo, controle fino, TypeScript end-to-end |
| Monorepo | Turborepo + pnpm | Build rapido, cache inteligente |
| UI | Tailwind CSS + shadcn/ui | Customizavel, sem lock-in |
| Drag & Drop | @dnd-kit/core | Melhor lib pra Kanban em React |
| Data Fetching | TanStack Query | Polling agora, WebSocket depois |
| ORM | Prisma | Type-safe, migrations |
| Banco | PostgreSQL | Robusto, JSON support |
| Fila | BullMQ + Redis | Job queue confiavel, retry, concurrency |
| Agent Execution | Claude CLI (headless -p) | Output JSON, child process |
| Validacao | Zod | Schemas compartilhados front/back |
| Auth | Better Auth ou Lucia | Leve, moderno |
| Infra | Local dev, VPS + Docker Compose prod | Controle total, custo previsivel |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    TECHTEAM PLATFORM                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         ┌──────────────────────────┐      │
│  │  FRONTEND     │  HTTP   │  BACKEND (Node.js)       │      │
│  │  Next.js      │◄──────►│  Fastify + BullMQ        │      │
│  │               │ polling │                          │      │
│  │  - Kanban     │ (→ WS) │  - REST API              │      │
│  │  - Demands    │         │  - Job Queue (agentes)   │      │
│  │  - Metrics    │         │  - Orchestrator          │      │
│  │  - Settings   │         │  - Agent Runner          │      │
│  └──────────────┘         └───────────┬──────────────┘      │
│                                       │                      │
│                            ┌──────────┴──────────┐          │
│                            │                     │          │
│                      ┌─────▼─────┐         ┌─────▼─────┐   │
│                      │PostgreSQL │         │  Redis     │   │
│                      │(Prisma)   │         │  (BullMQ)  │   │
│                      │           │         │  Job Queue │   │
│                      │- Tenants  │         │  + Cache   │   │
│                      │- Projects │         └───────────┘   │
│                      │- Demands  │                          │
│                      │- Stages   │    ┌─────────────────┐   │
│                      │- AgentRuns│    │ AGENT WORKERS    │   │
│                      └───────────┘    │                  │   │
│                                       │ Claude CLI       │   │
│                                       │ (headless -p)    │   │
│                                       │ + Agent Teams    │   │
│                                       └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Pipeline (7 Colunas)

```
INBOX → DISCOVERY → PLANNING → DEVELOPMENT → TESTING → MERGE → DONE
```

### Fases

1. **INBOX** — Humano cria demanda no dashboard, seleciona o projeto
2. **DISCOVERY** — Agent headless analisa a demanda, gera requisitos, estima complexidade (S/M/L/XL). Se houver ambiguidade, pausa e notifica humano.
3. **PLANNING** — Agent headless gera plano tecnico com tasks decompostas, arquivos afetados, dependencias. Output salvo como JSON.
4. **DEVELOPMENT** — Agent Teams para paralelismo. Cria branch isolada, team lead coordena teammates, commits atomicos, PR criado automaticamente.
5. **TESTING** — Agent headless faz review do PR, roda testes, verifica aderencia ao plano. Aprova ou rejeita (volta pra Development com feedback).
6. **MERGE** — 3 passos escalados:
   - Passo 1: Merge automatico + rodar testes
   - Passo 2: IA tenta resolver conflitos + testes
   - Passo 3: Notifica humano com contexto dos conflitos
7. **DONE** — Humano faz review final. Demanda arquivada com metricas.

### Concorrencia

- Ate 3 demandas em Development simultaneo por projeto (configuravel)
- Cada demanda trabalha em branch isolada
- Merge Queue FIFO com suporte a prioridade
- Discovery e Planning podem rodar em paralelo (read-only)

---

## Modelo de Dados

```
Tenant
  id, name, slug, plan (free/pro/enterprise), createdAt

User
  id, tenantId, email, name, role (admin/member), avatarUrl

Project
  id, tenantId, name, repoUrl, repoPath, defaultBranch,
  description, techStack, status (active/archived),
  maxConcurrentDev (1-3), mergeStrategy (fifo/priority)

Demand
  id, projectId, title, description, stage,
  priority (low/medium/high/urgent), complexity (S/M/L/XL),
  requirements (JSON), plan (JSON),
  branchName, prUrl,
  mergeStatus (pending/auto_merged/conflict_resolving/needs_human/merged),
  mergeConflicts (JSON), mergeAttempts,
  totalTokens, totalCostUsd,
  createdBy, createdAt, updatedAt

AgentRun
  id, demandId, stage, agentRole,
  model, status (running/completed/failed),
  inputPrompt, outputResult,
  tokensIn, tokensOut, costUsd, durationMs,
  errorMessage, startedAt, finishedAt
```

---

## Telas do Frontend

### 1. Projetos (Home)
- Lista de cards de projetos com metricas resumidas
- Contagem de demandas ativas, custo do mes
- Botao criar novo projeto
- Feed de atividade recente

### 2. Kanban Board (por projeto)
- 7 colunas com cards arrastáveis (drag-and-drop)
- Cada card: titulo, prioridade, status do agente, progresso, custo
- Botao nova demanda
- Cards com indicador visual quando agente esta rodando

### 3. Detalhe da Demanda
- Progress bar visual das fases
- Descricao original
- Output de cada fase (requirements, plan)
- Lista de Agent Runs com metricas individuais
- Tela de conflitos de merge (quando aplicavel)
- Custo e tempo totais

### 4. Metricas
- Custo por projeto/mes (grafico)
- Demandas concluidas por semana
- Tempo medio por fase
- Taxa de sucesso dos agentes
- Modelo mais usado

---

## Estrutura do Monorepo

```
TechTeam/
├── apps/
│   ├── web/                    # Next.js 15
│   │   ├── src/
│   │   │   ├── app/            # App Router (auth, dashboard, projects, board)
│   │   │   ├── components/     # board/, demands/, projects/, metrics/, ui/
│   │   │   └── lib/            # api.ts, utils.ts
│   │   ├── package.json
│   │   └── tailwind.config.ts
│   │
│   └── api/                    # Fastify
│       ├── src/
│       │   ├── server.ts
│       │   ├── routes/         # tenants, projects, demands, agent-runs, metrics
│       │   ├── services/       # orchestrator, agent-runner, prompt-builder, merge, git
│       │   ├── jobs/           # queue, discovery, planning, development, testing, merge
│       │   └── lib/            # claude.ts, prisma.ts, config.ts
│       └── package.json
│
├── packages/
│   └── shared/                 # Tipos, constantes, validators Zod
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── docker-compose.yml          # PostgreSQL + Redis
├── turbo.json
├── package.json
└── pnpm-workspace.yaml
```

---

## Milestones

### M1 — Fundacao
Monorepo rodando, CRUD completo, board visual estatico.
Voce cria projetos, abre demandas, e ve cards no Kanban.

### M2 — Agentes Vivos
Demandas fluem automaticamente pelo pipeline via agentes IA.
Voce cria uma demanda e ela percorre Discovery → Development → Testing sozinha.

### M3 — Concorrencia + Merge
Ate 3 demandas em Development simultaneo + merge inteligente em 3 passos.
Pipeline produtiva com multiplas demandas em paralelo.

### M4 — Metricas + Polish + Multi-tenant
Dashboard profissional, metricas de custo, auth completa, pronto pra clientes.
Plataforma apresentavel como produto/servico.

---

*Design aprovado em 11/02/2026*
