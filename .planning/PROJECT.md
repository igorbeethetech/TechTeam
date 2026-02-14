# TechTeam Platform

## What This Is

Plataforma de orquestracao de agentes IA para desenvolvimento de software automatizado. Demandas entram via dashboard web (Kanban board), fluem por um pipeline de 7 fases (Inbox, Discovery, Planning, Development, Testing, Merge, Done), e agentes Claude executam cada fase autonomamente. Destinado a ser oferecido como servico (AI Development as a Service) para clientes da Bee The Tech.

## Core Value

Demandas de desenvolvimento fluem automaticamente do input humano ate codigo pronto para merge, com agentes IA executando cada fase e o humano tendo visibilidade total via dashboard Kanban.

## Current Milestone: v1.1 — UX Improvements and Production Readiness

**Goal:** Melhorar a experiencia de navegacao, adicionar suporte a Claude MAX como alternativa a API key, validar pipeline E2E, e preparar para deploy em producao.

**Target features:**
- Navegacao lateral estilo Jira com pagina dedicada de Boards
- Cards clicaveis no Kanban para navegacao ao detalhe
- Integracao Claude MAX como alternativa a Anthropic API key
- Validacao E2E das fases 4 (Development/Testing) e 5 (Merge/Concurrency)
- Real-time WebSocket substituindo polling
- Bot Telegram para notificacoes
- Deploy em producao (VPS/containerizacao)

## Requirements

### Validated

- [x] Gestao de projetos (CRUD) com configuracao de repositorio — v1.0 Phase 1
- [x] Board Kanban com 7 colunas e drag-and-drop — v1.0 Phase 2
- [x] Abertura de demandas vinculadas a projetos — v1.0 Phase 2
- [x] Detalhe da demanda com progress bar de fases — v1.0 Phase 2
- [x] Agente Discovery: analisa demanda e gera requisitos — v1.0 Phase 3
- [x] Agente Planning: gera plano tecnico com tasks decompostas — v1.0 Phase 3
- [x] Agente Development: executa codigo com commits atomicos e cria PR — v1.0 Phase 4
- [x] Agente Testing: review de PR e validacao de qualidade — v1.0 Phase 4
- [x] Agente Merge: merge automatico em 3 passos (auto, IA resolve, humano) — v1.0 Phase 5
- [x] Ate 3 demandas concorrentes em Development por projeto — v1.0 Phase 5
- [x] Log de execucoes de agentes com metricas (tokens, custo, duracao) — v1.0 Phase 3
- [x] Dashboard de metricas (custo por projeto, demandas/semana, tempo por fase) — v1.0 Phase 6
- [x] Multi-tenant desde o design (Bee The Tech como primeiro tenant) — v1.0 Phase 1
- [x] Autenticacao de usuarios — v1.0 Phase 1
- [x] Formulario de clarificacao para intervencao humana no pipeline — v1.0 UAT fix
- [x] Pagina de Settings para configuracao de API keys por tenant — v1.0 UAT fix

### Active

- [ ] Navegacao lateral estilo Jira com sidebar para trocar entre projetos
- [ ] Pagina dedicada "Boards" com selecao de projeto
- [ ] Cards de demanda com texto clicavel para detalhe (mantendo drag-and-drop)
- [ ] Suporte Claude MAX como alternativa a Anthropic API key para agentes
- [ ] Validacao E2E do pipeline completo (Discovery → Planning → Development → Testing → Merge)
- [ ] Real-time WebSocket substituindo polling no board e detalhe
- [ ] Bot Telegram para notificacoes de eventos do pipeline
- [ ] Deploy em producao com Docker e VPS

### Out of Scope

- Mobile app nativa — web-first, responsive suficiente para v1.1
- Agent Teams experimental — SDK atual funciona, migrar quando estabilizar
- Marketplace de agentes — foco na pipeline core primeiro
- Multi-idioma (i18n) — portugues como idioma principal, ingles nos codigos

## Context

- Bee The Tech eh a empresa do Igor que presta servicos de tecnologia
- O sistema sera usado internamente primeiro e depois oferecido como servico para clientes
- Claude Code CLI suporta headless mode (`claude -p`) com output JSON para automacao
- Claude MAX eh assinatura mensal que usuario ja paga — quer usar como alternativa a API key
- v1.0 UAT completo: 6 fases, 23/28 testes passaram, 1 skip, 3 gaps corrigidos
- Fases 4 e 5 nao foram testaveis no UAT v1.0 (pipeline bloqueava no Discovery) — agora desbloqueado com formulario de clarificacao
- Pagina Settings adicionada para configuracao de GitHub token e Anthropic API key por tenant
- Design completo das telas e fluxos em `docs/plans/2026-02-11-techteam-platform-design.md`

## Constraints

- **Tech Stack**: Next.js 15 (frontend) + Node.js/Fastify (backend) + PostgreSQL + Redis/BullMQ — decisao do usuario
- **Monorepo**: Turborepo + pnpm workspaces — apps/web + apps/api + packages/shared
- **UI**: Tailwind CSS + shadcn/ui + @dnd-kit para Kanban
- **ORM**: Prisma com schema unico na raiz
- **Infra**: Docker Compose para PostgreSQL e Redis em dev local
- **Agent Execution**: Claude Agent SDK (primario) + Claude CLI headless para Claude MAX
- **Concorrencia**: Max 1 demanda em Development por projeto inicialmente, escalavel ate 3
- **Multi-tenant**: Todos os registros filtrados por tenantId desde o inicio

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + Fastify separados (nao full-stack) | WebSocket nativo no backend, controle fino da orquestracao, TypeScript end-to-end | ✓ Good |
| Turborepo monorepo | Build rapido, tipos compartilhados, DX unificada | ✓ Good |
| Polling primeiro, WebSocket depois | Pragmatico — funciona pro MVP, evolui depois | ✓ Good — WebSocket planejado para v1.1 |
| Multi-tenant desde o design | Visao de produto/servico, evita refactor futuro | ✓ Good |
| BullMQ para fila de agentes | Retry automatico, concurrency control, robusto | ✓ Good |
| Merge em 3 passos escalados | Auto → IA resolve → Humano — balanco entre automacao e seguranca | ✓ Good |
| Comecar local, VPS depois | Zero custo de infra inicial, validar primeiro | ✓ Good — deploy planejado para v1.1 |
| Claude Agent SDK ao inves de CLI headless | API direta, structured output, controle de custo | ⚠️ Revisit — usuario quer opcao Claude MAX via CLI |
| staleTime: 0 para queries com polling ativo | Global staleTime: 30s suprimia atualizacoes mesmo com refetchInterval | ✓ Good — corrigido no UAT |
| TenantSettings para credenciais por tenant | Cada tenant precisa de suas proprias API keys e tokens | ✓ Good |

---
*Last updated: 2026-02-13 after v1.0 UAT and v1.1 milestone start*
