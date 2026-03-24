# FLOW.md — Guia de Uso e Slash Commands

Este documento mostra o fluxo de trabalho do RemoteFlow no dia a dia e detalha todos os slash commands disponíveis atualmente.

Canal atual: Discord.
Arquitetura preparada para novos conectores (Telegram e outros).

---

## 1. Como funciona o fluxo

1. Você envia um comando no chat.
2. O RemoteFlow cria ou usa uma sessão associada a uma thread.
3. O OpenCode processa a tarefa no projeto local.
4. O resultado volta para a thread em tempo real.

Cada sessão fica ligada a um projeto e uma thread específica.

---

## 2. Fluxo recomendado de trabalho

1. Liste projetos com /projects
2. Inicie sessão com /plan ou /build
3. Interaja na thread até concluir a tarefa
4. Consulte /status e /diff durante o processo
5. Baixe histórico com /history se precisar registrar output
6. Encerre com /stop

Se GitHub estiver configurado:
- use /issue para puxar contexto de trabalho
- use /pr para listar, criar e revisar Pull Requests

---

## 3. Regras importantes

- Uma sessão por thread
- O bot pode limitar sessões por usuário/projeto/global, conforme .env
- Mensagens na thread podem ser encaminhadas automaticamente (passthrough)
- Quando passthrough estiver desligado, use /command para enviar entradas manualmente

---

## 4. Slash commands disponíveis

## 4.1 Sessões e operação

### /plan
Inicia sessão de planejamento com agente plan.

Opções:
- project (opcional, autocomplete)
- prompt (opcional)
- model (opcional, autocomplete)

Exemplos:
```text
/plan project:minha-api prompt:desenhar arquitetura de autenticação
/plan prompt:planejar refatoração da camada de dados
```

### /build
Inicia sessão de desenvolvimento com agente build.

Opções:
- project (opcional, autocomplete)
- prompt (opcional)
- model (opcional, autocomplete)

Exemplos:
```text
/build project:minha-api prompt:implementar endpoint de login
/build prompt:corrigir bug de concorrência no worker
```

### /sessions
Lista sessões ativas no momento.

### /status
Mostra status da sessão da thread atual (projeto, estado, usuário, atividade, fila).

### /stop
Solicita confirmação e encerra a sessão da thread atual.

### /projects
Lista subpastas disponíveis em PROJECTS_BASE_PATH.

### /history
Baixa o output completo da sessão atual em arquivo txt.

### /diff
Executa git diff HEAD no projeto da sessão da thread atual.
- quando pequeno: mostra inline
- quando grande: envia arquivo .diff

---

## 4.2 Entrada manual e fila

### /passthrough
Alterna o encaminhamento automático de mensagens da thread para o agente.

Comportamento:
- ativado: mensagens na thread vão para a sessão
- desativado: mensagens na thread são ignoradas; use /command

### /command
Envia comando personalizado para a sessão atual.

Opções:
- name (obrigatório, autocomplete a partir de OPENCODE_COMMANDS_PATH)
- args (opcional)

Exemplos:
```text
/command name:review
/command name:fix args:src/auth.js --quick
```

### /queue view
Mostra mensagens aguardando envio para o agente.

### /queue clear
Limpa mensagens pendentes da fila.

---

## 4.3 GitHub

### /pr create
Cria branch, commit, push e Pull Request com as mudanças da sessão atual.

Opções:
- title (opcional)
- base (opcional, padrão main)
- branch (opcional, auto-gerado se omitido)
- draft (opcional, padrão false)

Exemplo:
```text
/pr create title:feat: autenticação JWT base:main draft:false
```

### /pr list
Lista PRs do projeto.

Opções:
- project (opcional; se omitido usa sessão da thread)
- state (opcional: open, closed, all)

Exemplos:
```text
/pr list project:minha-api state:open
/pr list state:all
```

### /pr review
Inicia uma sessão plan para revisar um PR existente.

Opções:
- number (obrigatório)
- project (opcional)
- model (opcional)

Fluxo:
1. busca metadados e diff do PR
2. cria thread de revisão com agente plan
3. ao concluir, exibe botão para publicar review no GitHub

Exemplo:
```text
/pr review number:42 project:minha-api
```

### /issue list
Lista issues abertas do repositório.

Opções:
- project (opcional; se omitido usa sessão da thread)
- label (opcional)

Exemplo:
```text
/issue list project:minha-api label:enhancement
```

### /issue implement
Busca uma issue e inicia sessão build com o contexto dela.

Opções:
- number (obrigatório)
- project (obrigatório)
- model (opcional)

Exemplo:
```text
/issue implement number:17 project:minha-api
```

---

## 5. Fluxos prontos

## Planejar e implementar uma feature

1. /plan project:minha-api prompt:planejar autenticação JWT
2. revisar proposta na thread
3. /build project:minha-api prompt:implementar plano aprovado
4. /diff para validar mudanças
5. /pr create para abrir PR

## Implementar issue existente

1. /issue list project:minha-api
2. /issue implement number:17 project:minha-api
3. acompanhar execução na thread
4. /pr create title:feat: issue 17

## Revisar PR com agente

1. /pr review number:42 project:minha-api
2. aguardar conclusão da análise
3. clicar em Publicar Review no GitHub

---

## 6. Dicas rápidas

- Use model para controlar o modelo por sessão
- Use /sessions quando houver várias threads ativas
- Use /history para auditoria ou registro de decisões
- Se mensagens não forem processadas, cheque /passthrough e /queue view

---

Para setup completo, consulte INSTALL.md.
Para detalhes de integração com GitHub, consulte GITHUB.md.
