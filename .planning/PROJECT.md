# TechTeam Platform

## What This Is

Plataforma de orquestracao de agentes IA para desenvolvimento de software automatizado. Demandas entram via dashboard web (Kanban board), fluem por um pipeline de 7 fases (Inbox, Discovery, Planning, Development, Testing, Merge, Done), e agentes Claude executam cada fase autonomamente. Destinado a ser oferecido como servico (AI Development as a Service) para clientes da Bee The Tech.

## Core Value

Demandas de desenvolvimento fluem automaticamente do input humano ate codigo pronto para merge, com agentes IA executando cada fase e o humano tendo visibilidade total via dashboard Kanban.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Gestao de projetos (CRUD) com configuracao de repositorio
- [ ] Board Kanban com 7 colunas e drag-and-drop
- [ ] Abertura de demandas vinculadas a projetos
- [ ] Detalhe da demanda com progress bar de fases
- [ ] Agente Discovery: analisa demanda e gera requisitos
- [ ] Agente Planning: gera plano tecnico com tasks decompostas
- [ ] Agente Development: executa codigo com commits atomicos e cria PR
- [ ] Agente Testing: review de PR e validacao de qualidade
- [ ] Agente Merge: merge automatico em 3 passos (auto, IA resolve, humano)
- [ ] Ate 3 demandas concorrentes em Development por projeto
- [ ] Log de execucoes de agentes com metricas (tokens, custo, duracao)
- [ ] Dashboard de metricas (custo por projeto, demandas/semana, tempo por fase)
- [ ] Multi-tenant desde o design (Bee The Tech como primeiro tenant)
- [ ] Autenticacao de usuarios

### Out of Scope

- Telegram Bot — prioridade eh dashboard web primeiro
- Mobile app nativa — web-first
- Agent Teams experimental — comecar com headless mode, migrar depois
- Real-time WebSocket — comecar com polling, evoluir depois
- Deploy em producao (VPS) — comecar local, containerizar depois

## Context

- Bee The Tech eh a empresa do Igor que presta servicos de tecnologia
- O sistema sera usado internamente primeiro e depois oferecido como servico para clientes
- Claude Code CLI suporta headless mode (`claude -p`) com output JSON para automacao
- Agent Teams eh experimental mas funcional para fase de Development com paralelismo
- O documento `agent-teams-vs-custom-pipeline.md` contem analise detalhada da arquitetura hibrida
- Design completo das telas e fluxos em `docs/plans/2026-02-11-techteam-platform-design.md`

## Constraints

- **Tech Stack**: Next.js 15 (frontend) + Node.js/Fastify (backend) + PostgreSQL + Redis/BullMQ — decisao do usuario
- **Monorepo**: Turborepo + pnpm workspaces — apps/web + apps/api + packages/shared
- **UI**: Tailwind CSS + shadcn/ui + @dnd-kit para Kanban
- **ORM**: Prisma com schema unico na raiz
- **Infra**: Docker Compose para PostgreSQL e Redis em dev local
- **Agent Execution**: Claude CLI headless (`claude -p`) como child process
- **Concorrencia**: Max 1 demanda em Development por projeto inicialmente, escalavel ate 3
- **Multi-tenant**: Todos os registros filtrados por tenantId desde o inicio

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + Fastify separados (nao full-stack) | WebSocket nativo no backend, controle fino da orquestracao, TypeScript end-to-end | — Pending |
| Turborepo monorepo | Build rapido, tipos compartilhados, DX unificada | — Pending |
| Polling primeiro, WebSocket depois | Pragmatico — funciona pro MVP, evolui depois | — Pending |
| Multi-tenant desde o design | Visao de produto/servico, evita refactor futuro | — Pending |
| BullMQ para fila de agentes | Retry automatico, concurrency control, robusto | — Pending |
| Merge em 3 passos escalados | Auto → IA resolve → Humano — balanco entre automacao e seguranca | — Pending |
| Comecar local, VPS depois | Zero custo de infra inicial, validar primeiro | — Pending |

---
*Last updated: 2026-02-11 after initialization*
