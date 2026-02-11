# 🔄 Claude Agent Teams vs Pipeline Customizada — Qual Caminho Seguir?

## Resumo Executivo

O **Claude Agent Teams** (lançado oficialmente em 05/02/2026 com o Opus 4.6) é exatamente o conceito de "equipe de IAs trabalhando juntas" que você descreveu. No entanto, ele resolve **parte** do problema — a execução paralela de agentes — mas **não resolve** o problema completo da esteira automatizada com Kanban, persistência, input mobile, e ciclo de vida de demandas.

**A resposta curta: use os dois.** Agent Teams como motor de execução dentro de uma camada de orquestração customizada.

---

## 1. O que é o Claude Agent Teams (Estado Atual)

### Como Funciona

- Um **team lead** (sessão principal do Claude Code) coordena múltiplos **teammates**
- Cada teammate é uma instância separada do Claude Code com seu próprio contexto
- Comunicação via **mailbox** (mensagens peer-to-peer, não apenas hub-and-spoke)
- **Task list compartilhada** com dependency tracking e file-lock para evitar race conditions
- Teammates auto-reivindicam tasks disponíveis quando terminam a atual
- Suporte a **plan mode**: teammate planeja antes de executar, lead aprova o plano

### Como Ativar

```json
// settings.json do Claude Code
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Operações Disponíveis (TeammateTool)

| Operação | Função |
|----------|--------|
| `spawnTeam` | Criar um time |
| `spawn` (via Task) | Adicionar teammate especializado |
| `message` | Enviar mensagem para teammate |
| `broadcast` | Mensagem para todos |
| `shutdown_request` | Pedir shutdown de teammate |
| `cleanup` | Limpar time completo |
| `TaskCreate` | Criar tarefa na lista compartilhada |
| `TaskUpdate` | Atualizar status de tarefa |
| `TaskList` | Listar todas as tarefas |
| `plan_approval_response` | Aprovar/rejeitar plano de um teammate |

### Limitações Atuais (Fevereiro 2026)

| Limitação | Impacto na Sua Esteira |
|-----------|----------------------|
| **Sem session resumption** | Se cair, não retoma de onde parou |
| **1 team por sessão** | Não pode gerenciar múltiplas demandas simultâneas |
| **Sem nested teams** | Não pode ter sub-times dentro de times |
| **Experimental** | Pode mudar ou quebrar com updates |
| **Requer terminal ativo** | Precisa de tmux/iTerm2 rodando — não é "fire and forget" |
| **Sem API REST/webhook** | Não dá pra disparar via Telegram ou Web App |
| **Sem persistência de estado** | Tasks vivem em arquivos locais, não banco de dados |
| **Sem métricas/custos** | Não rastreia tokens gastos por agente |
| **Split panes não funcionam no VS Code** | Só funciona bem em terminal com tmux |
| **Recomendado 2-5 teammates** | Não é feito para 10+ agentes simultâneos |

---

## 2. Comparação Direta

### O Que Cada Abordagem Resolve

| Necessidade | Agent Teams | Pipeline Custom | Ambos |
|-------------|:-----------:|:---------------:|:-----:|
| Múltiplos agentes trabalhando em paralelo | ✅ | ✅ | ✅ |
| Comunicação entre agentes | ✅ | ✅ | ✅ |
| Task list com dependências | ✅ | ✅ | ✅ |
| Plan mode (planejar antes de executar) | ✅ | ✅ | ✅ |
| Skills especializadas por agente | ✅ (via CLAUDE.md) | ✅ (mais controle) | ✅ |
| Abrir demanda pelo celular | ❌ | ✅ | ✅ |
| Board Kanban visual | ❌ | ✅ | ✅ |
| Persistência de estado (DB) | ❌ | ✅ | ✅ |
| Retomar após falha/crash | ❌ | ✅ | ✅ |
| Múltiplas demandas simultâneas | ❌ | ✅ | ✅ |
| Métricas e controle de custos | ❌ | ✅ | ✅ |
| Notificações (Telegram/Slack) | ❌ | ✅ | ✅ |
| Validação humana estruturada | ❌ | ✅ | ✅ |
| Histórico de execuções | ❌ | ✅ | ✅ |
| Rodar 100% cloud sem terminal | ❌ | ✅ | ✅ |
| Setup rápido (minutos) | ✅ | ❌ (dias/semanas) | — |
| Zero código de orquestração | ✅ | ❌ | — |
| Coordenação nativa entre Claude Codes | ✅ | ⚠️ (precisa implementar) | ✅ |

### Pontos Fortes de Cada Um

**Agent Teams é melhor quando:**
- Você está no terminal e quer delegar uma task complexa para vários agentes AGORA
- O escopo é um projeto/repo específico
- É uma sessão única (começo, meio e fim)
- Você está presente para supervisionar

**Pipeline Custom é melhor quando:**
- Você quer uma fábrica contínua que roda 24/7
- Múltiplas demandas entram em paralelo
- Precisa de rastreabilidade e histórico
- Input vem de mobile/web/API
- Precisa sobreviver a crashes e retomar
- Quer oferecer como serviço para clientes

---

## 3. A Arquitetura Híbrida (Recomendação)

A melhor abordagem é usar **Agent Teams DENTRO da pipeline customizada**. Sua camada de orquestração gerencia o ciclo de vida das demandas, e para a fase de desenvolvimento, dispara um Agent Team que coordena os agentes de coding internamente.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SUA CAMADA DE ORQUESTRAÇÃO                          │
│                 (API + DB + Kanban + Telegram Bot)                     │
│                                                                        │
│  📱 Input ──▶ 📋 Board ──▶ Triggers automáticos por coluna            │
└────────┬──────────┬───────────┬──────────────┬──────────────┬──────────┘
         │          │           │              │              │
         ▼          ▼           ▼              ▼              ▼
    ┌─────────┐ ┌────────┐ ┌──────────────────────┐ ┌─────────┐ ┌────────┐
    │Discovery│ │Planning│ │    DEVELOPMENT        │ │ Testing │ │ Review │
    │         │ │        │ │                        │ │         │ │        │
    │ Claude  │ │ Claude │ │  ┌──────────────────┐  │ │ Claude  │ │ Igor   │
    │ Headless│ │Headless│ │  │ AGENT TEAM       │  │ │Headless │ │        │
    │ -p mode │ │-p mode │ │  │ Lead + Teammates │  │ │ -p mode │ │        │
    │         │ │        │ │  │ (coordenação     │  │ │         │ │        │
    │ 1 agent │ │1 agent │ │  │  nativa Claude)  │  │ │ 1 agent │ │        │
    └─────────┘ └────────┘ │  └──────────────────┘  │ └─────────┘ └────────┘
                           │  Via Agent SDK (Python) │
                           └──────────────────────────┘
```

### Por Que Essa Abordagem?

1. **Discovery e Planning** são tarefas sequenciais de 1 agente → **headless mode** é mais simples e barato

2. **Development** é onde o paralelismo importa de verdade → **Agent Teams** brilha aqui:
   - Lead recebe o plano e decompõe em tasks
   - Spawna teammates especializados (frontend, backend, testes)
   - Teammates trabalham em paralelo com comunicação nativa
   - Lead coordena e faz merge dos resultados

3. **Testing** é análise sequencial do output → **headless mode** novamente

4. **Sua camada de orquestração** cuida de tudo que Agent Teams NÃO faz:
   - Persistência, retomada, métricas, input mobile, notificações

### Implementação Prática

```python
# orchestrator/agents/development.py
import anyio
import subprocess
import json
from claude_agent_sdk import query, ClaudeAgentOptions

async def run_development_phase(demand_id: str, plan: dict, repo_path: str):
    """
    Fase de desenvolvimento: usa Agent Teams para trabalho paralelo.
    Chamado pelo orquestrador quando card entra na coluna 'Development'.
    """
    
    # Monta o prompt para o Team Lead
    tasks_description = "\n".join([
        f"- Task {i+1}: {task['title']} — {task['description']}"
        for i, task in enumerate(plan['tasks'])
    ])
    
    team_prompt = f"""
    Você é o líder de um time de desenvolvimento.
    
    PROJETO: {plan['project_name']}
    REPOSITÓRIO: {repo_path}
    
    TASKS PARA EXECUTAR:
    {tasks_description}
    
    INSTRUÇÕES:
    1. Crie um agent team chamado "dev-{demand_id}"
    2. Para cada task, spawne um teammate especializado
    3. Exija plan approval antes de cada implementação
    4. Cada teammate deve:
       - Criar branch própria (feat/task-N-descricao)
       - Implementar com testes
       - Fazer commits atômicos
       - Reportar conclusão
    5. Ao final, consolide os resultados e reporte
    
    CRITÉRIOS DE APROVAÇÃO DE PLANOS:
    - Deve incluir testes unitários
    - Não pode modificar arquivos fora do escopo
    - Deve seguir padrões do CLAUDE.md
    """
    
    # Opção A: Via Agent SDK (mais controle)
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep",
                       "Teammate", "SendMessage", "TaskCreate", "TaskUpdate", "TaskList"],
        model="claude-sonnet-4-5-20250929",
        max_turns=100,  # mais turns para coordenação de time
        cwd=repo_path
    )
    
    results = []
    async for message in query(prompt=team_prompt, options=options):
        if hasattr(message, "result"):
            results.append(message.result)
        # Opcional: salvar progresso no banco em tempo real
        await save_agent_progress(demand_id, message)
    
    return {
        "status": "completed",
        "output": "\n".join(results),
        "demand_id": demand_id
    }


    # Opção B: Via Headless CLI (mais simples, menos controle)
    # result = subprocess.run(
    #     ["claude", "-p", team_prompt,
    #      "--allowedTools", "Read,Write,Edit,Bash,Teammate,SendMessage,TaskCreate,TaskUpdate",
    #      "--output-format", "json",
    #      "--max-turns", "100"],
    #     capture_output=True, text=True, cwd=repo_path,
    #     env={**os.environ, "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}
    # )
```

---

## 4. Quando Agent Teams Vai Estar "Pronto" para Uso em Produção?

### O Que a Anthropic Já Sinalizou

Com base no padrão da Anthropic (community proves → Anthropic ships), é provável que nos próximos meses:

| Feature | Probabilidade | Impacto |
|---------|:------------:|---------|
| Session resumption | Alta | Permitiria retomar teams após crash |
| API/SDK support nativo | Alta | Agent SDK já existe, integração é natural |
| Múltiplos teams por sessão | Média | Permitiria múltiplas demandas simultâneas |
| Nested teams | Média | Times dentro de times |
| Métricas de custo por teammate | Alta | Essencial para produção |
| Web-based teams (claude.ai/code) | Média | Eliminaria necessidade de VPS |

### O Caso do Compilador C (Referência de Escala)

A Anthropic demonstrou internamente um projeto com **16 agentes paralelos** trabalhando por 2 semanas, ~2000 sessões, ~2 bilhões de tokens de input, custando ~$20.000. O resultado foi um compilador C funcional que compila o kernel Linux. Isso prova que a arquitetura escala — mas com verificação robusta (no caso, testes do GCC como oráculo).

---

## 5. Plano de Ação Recomendado

### Fase 1: Comece Já (com o que funciona hoje)

```
Semana 1-2:
├── Setup VPS + Docker
├── API simples (FastAPI) para CRUD de demandas
├── Telegram Bot para abertura de demandas
├── Agent Discovery (headless -p) → gera requisitos
└── Agent Planning (headless -p) → gera plano

Semana 3-4:
├── Agent Development usando Agent Teams
│   └── Team lead + 2-3 teammates por demanda
├── Agent Testing (headless -p) → review + testes
├── Transições automáticas entre colunas
└── Notificações Telegram
```

### Fase 2: Evolua Conforme Agent Teams Amadurece

```
Mês 2-3:
├── Dashboard Kanban web (React)
├── Métricas de custo por demanda/agente
├── Templates de demanda por tipo
├── Skills refinadas com feedback loops
└── Migrar para Agent SDK quando session resumption sair
```

### Fase 3: Escale para Produção

```
Mês 3+:
├── Multi-projeto (clientes da Bee The Tech)
├── Auto-scaling de workers
├── Roteamento inteligente de modelos
└── Oferecer como serviço (AI Development as a Service)
```

---

## 6. Resumo da Decisão

| Aspecto | Decisão |
|---------|---------|
| **Fase de Dev (paralelismo)** | ✅ Use Agent Teams — coordenação nativa é superior |
| **Demais fases (sequenciais)** | ✅ Use Headless Mode — mais simples e barato |
| **Ciclo de vida da demanda** | ✅ Pipeline customizada — Agent Teams não cobre isso |
| **Input mobile** | ✅ Telegram Bot + API própria |
| **Board visual** | ✅ Dashboard custom ou Vibe Kanban |
| **Persistência/retomada** | ✅ PostgreSQL + Redis na sua camada |
| **Esperar Agent Teams estabilizar?** | ❌ Não — comece agora, Agent Teams já funciona para dev |

**Bottom line:** Agent Teams é uma peça poderosa do quebra-cabeça, mas não é o quebra-cabeça inteiro. Você precisa da camada de orquestração ao redor. A boa notícia é que as duas coisas se complementam perfeitamente, e você pode começar hoje usando o headless mode para tudo e migrar a fase de dev para Agent Teams quando se sentir confortável.

---

*Documento atualizado em Fevereiro/2026*
