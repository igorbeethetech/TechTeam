# Requirements: TechTeam Platform

**Defined:** 2026-02-11
**Core Value:** Demandas de desenvolvimento fluem automaticamente do input humano ate codigo pronto para merge, com agentes IA executando cada fase e o humano tendo visibilidade total via dashboard Kanban.

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: Monorepo Turborepo com apps/web, apps/api, packages/shared funcional com pnpm workspaces
- [ ] **INFRA-02**: Docker Compose sobe PostgreSQL 16 e Redis 7 com um comando
- [ ] **INFRA-03**: Schema Prisma com migrations rodando contra PostgreSQL
- [ ] **INFRA-04**: Tipos e validators Zod compartilhados entre frontend e backend via packages/shared
- [ ] **INFRA-05**: Fastify backend com rotas REST respondendo JSON

### Authentication

- [ ] **AUTH-01**: User pode criar conta com email e senha
- [ ] **AUTH-02**: User pode fazer login e receber JWT com tenantId
- [ ] **AUTH-03**: User pode fazer logout
- [ ] **AUTH-04**: Sessao persiste entre refreshes do browser via token

### Multi-Tenant

- [ ] **TENANT-01**: Cada registro no banco pertence a um tenant via tenantId
- [ ] **TENANT-02**: Queries sao filtradas automaticamente por tenantId via Prisma middleware
- [ ] **TENANT-03**: User so ve dados do seu proprio tenant
- [ ] **TENANT-04**: Bee The Tech eh criado como tenant padrao no seed

### Projects

- [ ] **PROJ-01**: User pode criar projeto com nome, descricao, repo URL, repo path, e tech stack
- [ ] **PROJ-02**: User pode listar todos os projetos do seu tenant
- [ ] **PROJ-03**: User pode editar configuracoes de um projeto
- [ ] **PROJ-04**: User pode configurar maxConcurrentDev (1-3) e mergeStrategy (fifo/priority) por projeto
- [ ] **PROJ-05**: User pode arquivar um projeto

### Kanban Board

- [ ] **BOARD-01**: User ve board com 7 colunas (Inbox, Discovery, Planning, Development, Testing, Merge, Done)
- [ ] **BOARD-02**: Cada coluna mostra cards das demandas naquele stage
- [ ] **BOARD-03**: Cards mostram titulo, prioridade, status do agente, e custo acumulado
- [ ] **BOARD-04**: User pode arrastar cards entre colunas via drag-and-drop
- [ ] **BOARD-05**: Board atualiza automaticamente via polling a cada 5 segundos

### Demands

- [ ] **DEM-01**: User pode criar demanda com titulo, descricao, e prioridade (low/medium/high/urgent)
- [ ] **DEM-02**: User deve selecionar projeto ao criar demanda
- [ ] **DEM-03**: User pode ver detalhe da demanda com progress bar de fases
- [ ] **DEM-04**: Detalhe mostra output de cada fase (requirements do Discovery, plan do Planning)
- [ ] **DEM-05**: Detalhe mostra lista de Agent Runs com tokens, custo e duracao
- [ ] **DEM-06**: Demanda acumula totalTokens e totalCostUsd de todos os Agent Runs

### Agent Pipeline

- [ ] **AGENT-01**: Quando demanda entra em Discovery, um job eh enfileirado no BullMQ
- [ ] **AGENT-02**: Worker executa Claude CLI headless (`claude -p`) com prompt contextualizado
- [ ] **AGENT-03**: Output do agente eh parseado e salvo no banco (requirements JSON, plan JSON)
- [ ] **AGENT-04**: Cada execucao gera um AgentRun com tokensIn, tokensOut, costUsd, durationMs
- [ ] **AGENT-05**: Ao concluir uma fase, demanda avanca automaticamente para a proxima
- [ ] **AGENT-06**: Se agente falhar, job eh retentado ate 3 vezes com backoff exponencial
- [ ] **AGENT-07**: Timeouts por fase: Discovery 2min, Planning 5min, Development 30min, Testing 10min, Merge 10min

### Discovery Agent

- [ ] **DISC-01**: Agent recebe descricao da demanda + techStack do projeto
- [ ] **DISC-02**: Agent produz requisitos funcionais e nao-funcionais em JSON estruturado
- [ ] **DISC-03**: Agent estima complexidade (S/M/L/XL)
- [ ] **DISC-04**: Se houver ambiguidade, demanda pausa e notifica humano

### Planning Agent

- [ ] **PLAN-01**: Agent recebe requirements do Discovery + estrutura do repo
- [ ] **PLAN-02**: Agent produz plano tecnico com tasks decompostas em JSON
- [ ] **PLAN-03**: Plano inclui arquivos que serao criados/modificados e dependencias entre tasks

### Development Agent

- [ ] **DEV-01**: Orchestrador cria branch isolada (demand/{id}-{slug}) a partir da default branch
- [ ] **DEV-02**: Agent recebe plano do Planning e executa no repo path do projeto
- [ ] **DEV-03**: Agent faz commits atomicos durante o desenvolvimento
- [ ] **DEV-04**: Ao concluir, PR eh criado automaticamente

### Testing Agent

- [ ] **TEST-01**: Agent recebe PR URL + plano original + requirements
- [ ] **TEST-02**: Agent roda testes automatizados do projeto
- [ ] **TEST-03**: Agent analisa qualidade do codigo e aderencia ao plano
- [ ] **TEST-04**: Agent gera relatorio de aprovacao ou rejeicao
- [ ] **TEST-05**: Se rejeitado, demanda volta para Development com feedback

### Merge

- [ ] **MERGE-01**: Merge queue FIFO por projeto (quem terminou Testing primeiro, faz merge primeiro)
- [ ] **MERGE-02**: Passo 1: Agent tenta merge automatico + roda testes
- [ ] **MERGE-03**: Passo 2: Se conflito, agent IA tenta resolver + roda testes
- [ ] **MERGE-04**: Passo 3: Se nao resolver, card fica amarelo no board e notifica humano com contexto
- [ ] **MERGE-05**: Humano pode resolver conflitos e sinalizar resolucao no dashboard

### Concurrency

- [ ] **CONC-01**: Ate N demandas podem estar em Development simultaneamente (N = maxConcurrentDev do projeto)
- [ ] **CONC-02**: Demandas alem do limite ficam na fila aguardando
- [ ] **CONC-03**: Discovery e Planning podem rodar em paralelo (read-only)
- [ ] **CONC-04**: Cada demanda em Development trabalha em branch isolada

### Metrics

- [ ] **METR-01**: Dashboard mostra custo total por projeto no mes corrente
- [ ] **METR-02**: Dashboard mostra demandas concluidas por semana (grafico)
- [ ] **METR-03**: Dashboard mostra tempo medio por fase
- [ ] **METR-04**: Dashboard mostra taxa de sucesso dos agentes (% completed vs failed)

### Notifications

- [ ] **NOTIF-01**: User recebe notificacao in-app quando agente falha
- [ ] **NOTIF-02**: User recebe notificacao quando merge precisa de intervencao humana
- [ ] **NOTIF-03**: User recebe notificacao quando demanda chega em Done

## v2 Requirements

### Real-Time

- **RT-01**: WebSocket substitui polling para atualizacoes em tempo real
- **RT-02**: Cards se movem automaticamente no board sem refresh

### Advanced Merge

- **AMERGE-01**: IA aprende com resolucoes anteriores de conflitos
- **AMERGE-02**: Diff viewer inline no dashboard para conflitos

### Analytics

- **ANAL-01**: Estimativa preditiva de custo baseada em historico
- **ANAL-02**: Comparacao de performance entre modelos de IA
- **ANAL-03**: Analise de tendencias (tempo por fase ao longo do tempo)

### Integrations

- **INT-01**: Telegram Bot para abertura de demandas
- **INT-02**: Slack/Discord notifications
- **INT-03**: API publica para integracoes externas

### Advanced Multi-Tenant

- **MT-01**: Onboarding self-service de novos tenants
- **MT-02**: Planos de assinatura (free/pro/enterprise) com limites
- **MT-03**: RBAC avancado (team-level permissions)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app nativa | Web-first. Browser mobile suficiente para MVP |
| Agent Teams experimental | Comecar com headless mode estavel. Migrar quando Agent Teams estabilizar |
| WYSIWYG workflow designer | Pipeline fixa de 7 fases cobre 95% dos casos. Complexidade desnecessaria |
| Multi-model support (GPT-4, Gemini) | Claude-only simplifica prompts, testes e custos. Avaliar demanda depois |
| Self-hosted/on-prem | Cloud-first SaaS. SOC2 e data residency sao futuro |
| Real-time collaboration (multi-user editing) | Single owner per demand. Race conditions nao valem a complexidade |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| TENANT-01 | Phase 1 | Pending |
| TENANT-02 | Phase 1 | Pending |
| TENANT-03 | Phase 1 | Pending |
| TENANT-04 | Phase 1 | Pending |
| PROJ-01 | Phase 1 | Pending |
| PROJ-02 | Phase 1 | Pending |
| PROJ-03 | Phase 1 | Pending |
| PROJ-04 | Phase 1 | Pending |
| PROJ-05 | Phase 1 | Pending |
| BOARD-01 | Phase 1 | Pending |
| BOARD-02 | Phase 1 | Pending |
| BOARD-03 | Phase 1 | Pending |
| BOARD-04 | Phase 1 | Pending |
| BOARD-05 | Phase 2 | Pending |
| DEM-01 | Phase 1 | Pending |
| DEM-02 | Phase 1 | Pending |
| DEM-03 | Phase 1 | Pending |
| DEM-04 | Phase 2 | Pending |
| DEM-05 | Phase 2 | Pending |
| DEM-06 | Phase 2 | Pending |
| AGENT-01 | Phase 2 | Pending |
| AGENT-02 | Phase 2 | Pending |
| AGENT-03 | Phase 2 | Pending |
| AGENT-04 | Phase 2 | Pending |
| AGENT-05 | Phase 2 | Pending |
| AGENT-06 | Phase 2 | Pending |
| AGENT-07 | Phase 2 | Pending |
| DISC-01 | Phase 2 | Pending |
| DISC-02 | Phase 2 | Pending |
| DISC-03 | Phase 2 | Pending |
| DISC-04 | Phase 2 | Pending |
| PLAN-01 | Phase 2 | Pending |
| PLAN-02 | Phase 2 | Pending |
| PLAN-03 | Phase 2 | Pending |
| DEV-01 | Phase 3 | Pending |
| DEV-02 | Phase 3 | Pending |
| DEV-03 | Phase 3 | Pending |
| DEV-04 | Phase 3 | Pending |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |
| TEST-03 | Phase 3 | Pending |
| TEST-04 | Phase 3 | Pending |
| TEST-05 | Phase 3 | Pending |
| MERGE-01 | Phase 4 | Pending |
| MERGE-02 | Phase 4 | Pending |
| MERGE-03 | Phase 4 | Pending |
| MERGE-04 | Phase 4 | Pending |
| MERGE-05 | Phase 4 | Pending |
| CONC-01 | Phase 4 | Pending |
| CONC-02 | Phase 4 | Pending |
| CONC-03 | Phase 4 | Pending |
| CONC-04 | Phase 3 | Pending |
| METR-01 | Phase 4 | Pending |
| METR-02 | Phase 4 | Pending |
| METR-03 | Phase 4 | Pending |
| METR-04 | Phase 4 | Pending |
| NOTIF-01 | Phase 4 | Pending |
| NOTIF-02 | Phase 4 | Pending |
| NOTIF-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 63 total
- Mapped to phases: 63
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-11*
*Last updated: 2026-02-11 after initial definition*
