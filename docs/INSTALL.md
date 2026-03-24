# INSTALL.md — Instalação e Configuração

Este guia cobre todo o processo para instalar e configurar o RemoteFlow em ambiente local (Windows), incluindo variáveis de ambiente e validação inicial.

---

## 1. Pré-requisitos

- Node.js 20 ou superior
- npm (já vem com Node.js)
- Git instalado e disponível no PATH
- OpenCode CLI instalado e disponível no PATH (ou caminho absoluto configurado em OPENCODE_BIN)
- Conta e servidor no Discord
- Bot Discord criado no Discord Developer Portal

Opcional:
- NSSM (para rodar como serviço no Windows)
- Token do GitHub (para comandos /pr e /issue)

---

## 2. Clonar e instalar dependências

```bash
git clone https://github.com/lennondias/remoteflow.git
cd remoteflow
npm install
```

---

## 3. Configurar bot no Discord

### 3.1 Criar aplicação e bot

1. Acesse https://discord.com/developers/applications
2. Clique em New Application
3. Abra a seção Bot
4. Clique em Add Bot
5. Copie o token do bot (DISCORD_TOKEN)

### 3.2 Habilitar intents

No painel do bot, habilite os intents necessários:
- Message Content Intent
- Server Members Intent (opcional, mas recomendado para ambientes maiores)

### 3.3 Convidar o bot para o servidor

Na seção OAuth2 > URL Generator:
- Scopes: bot, applications.commands
- Bot Permissions: Send Messages, Create Public Threads, Create Private Threads, Read Message History, Embed Links, Attach Files, Add Reactions

Abra a URL gerada e adicione o bot ao servidor alvo.

### 3.4 Obter IDs

Com o modo desenvolvedor do Discord habilitado:
- DISCORD_GUILD_ID: ID do servidor
- DISCORD_CLIENT_ID (opcional): Application ID
- DISCORD_ALLOWED_CHANNEL_ID (opcional): canal único permitido para comandos

---

## 4. Configurar arquivo .env

Crie o arquivo .env a partir do modelo:

```bash
copy .env.example .env
```

Em PowerShell, alternativa:

```powershell
Copy-Item .env.example .env
```

Edite o arquivo .env e preencha os valores.

---

## 5. Variáveis de ambiente

## Obrigatórias

| Variável | Exemplo | Descrição |
|---|---|---|
| DISCORD_TOKEN | seu_token | Token do bot Discord |
| DISCORD_GUILD_ID | 123456789012345678 | ID do servidor onde os slash commands serão registrados |
| PROJECTS_BASE_PATH | C:\Users\SeuUsuario\projetos | Diretório base dos projetos |

## Discord e controle de acesso

| Variável | Padrão | Descrição |
|---|---|---|
| DISCORD_CLIENT_ID | vazio | Application ID, usado como fallback no registro dos comandos |
| DISCORD_ALLOWED_CHANNEL_ID | vazio | Restringe uso do bot a um canal pai específico |
| ALLOWED_USER_IDS | vazio | Lista de usuários autorizados, separados por vírgula |
| ALLOW_SHARED_SESSIONS | false | Permite que outros usuários interajam com sessões alheias |
| ENABLE_DM_NOTIFICATIONS | false | Habilita notificação por DM quando sessão aguarda input |
| DISCORD_MSG_LIMIT | 1900 | Limite por mensagem enviada ao Discord |
| STREAM_UPDATE_INTERVAL | 1500 | Intervalo de atualização de streaming em ms |

## OpenCode e modelos

| Variável | Padrão | Descrição |
|---|---|---|
| OPENCODE_BIN | opencode | Binário do OpenCode CLI |
| OPENCODE_BASE_PORT | 4100 | Porta base para instâncias opencode serve |
| OPENCODE_TIMEOUT_MS | 10000 | Timeout padrão de chamadas ao OpenCode |
| DEFAULT_MODEL | vazio | Modelo padrão para /plan e /build |
| AVAILABLE_MODELS | fallback interno | Lista de modelos para autocomplete se opencode models falhar |
| OPENCODE_COMMANDS_PATH | ~/.config/opencode/command | Diretório de comandos customizados usados por /command |

## Sessões e limites

| Variável | Padrão | Descrição |
|---|---|---|
| MAX_SESSIONS_PER_USER | 3 | Sessões simultâneas por usuário |
| MAX_GLOBAL_SESSIONS | 0 | Limite global de sessões (0 = sem limite) |
| MAX_SESSIONS_PER_PROJECT | 2 | Sessões simultâneas por projeto |
| SESSION_TIMEOUT_MS | 1800000 | Timeout de inatividade por sessão |
| MAX_BUFFER | 512000 | Buffer máximo de output por sessão |

## Operação, persistência e auditoria

| Variável | Padrão | Descrição |
|---|---|---|
| HEALTH_PORT | 9090 | Porta do health check |
| PERSISTENCE_PATH | vazio | Caminho do arquivo de persistência de sessões |
| AUDIT_LOG_PATH | ~/.remote-flow/audit.ndjson | Caminho do log de auditoria |
| DEBUG | false | Ativa logs detalhados |

## Timeouts internos avançados

| Variável | Padrão | Descrição |
|---|---|---|
| SERVER_RESTART_DELAY_MS | 2000 | Delay para reinício do servidor OpenCode |
| LOG_FILE_READ_DELAY_MS | 500 | Delay para leitura de logs após falha |
| THREAD_ARCHIVE_DELAY_MS | 5000 | Delay para arquivamento de thread |
| STATUS_QUEUE_ITEM_TIMEOUT_MS | 5000 | Timeout por item na fila de status |
| SHUTDOWN_TIMEOUT_MS | 10000 | Timeout de shutdown gracioso |
| CHANNEL_FETCH_TIMEOUT_MS | 2000 | Timeout para fetch de canal no shutdown |
| SERVER_CIRCUIT_BREAKER_COOLDOWN_MS | 60000 | Cooldown do circuit breaker |
| PERMISSION_TIMEOUT_MS | 60000 | Timeout para aprovação interativa de permissões |

## GitHub (opcional)

| Variável | Padrão | Descrição |
|---|---|---|
| GITHUB_TOKEN | vazio | Token para integração GitHub |
| GITHUB_DEFAULT_OWNER | vazio | Fallback owner quando não há remote origin |
| GITHUB_DEFAULT_REPO | vazio | Fallback repo quando não há remote origin |
| GIT_AUTHOR_NAME | RemoteFlow Bot | Nome para commits automáticos |
| GIT_AUTHOR_EMAIL | bot@remote-flow.local | Email para commits automáticos |

---

## 6. Primeira execução

```bash
npm start
```

Na primeira inicialização, o bot:
- valida variáveis obrigatórias
- conecta ao Discord
- registra slash commands no servidor configurado
- inicia o endpoint de health check

Se DISCORD_CLIENT_ID não estiver definido, o sistema usa o client.application.id automaticamente após login.

---

## 7. Validação recomendada

```bash
npm run test:ci
node --check src/index.js
```

Resultado esperado:
- testes passando
- verificação de sintaxe sem erros

---

## 8. Rodando em modo desenvolvimento

```bash
npm run dev
```

Modo watch reinicia o bot automaticamente ao salvar alterações em src.

---

## 9. Instalação como serviço no Windows (opcional)

```bash
npm run install-service
```

Observações:
- execute o terminal como Administrador
- o script usa NSSM

Para liberar porta ocupada durante troubleshooting:

```bash
npm run kill-port
```

---

## 10. Problemas comuns

## Bot não inicia por variáveis ausentes

Mensagem típica: Variáveis de ambiente faltando.

Ação:
- confira DISCORD_TOKEN, DISCORD_GUILD_ID e PROJECTS_BASE_PATH no .env

## Slash commands não aparecem

Ações:
- confirme DISCORD_GUILD_ID correto
- confirme permissões applications.commands no convite do bot
- reinicie o processo para forçar novo registro

## Comandos /pr e /issue falham

Ações:
- configure GITHUB_TOKEN
- confira escopo repo no token
- confirme remote origin válido para GitHub ou configure GITHUB_DEFAULT_OWNER/GITHUB_DEFAULT_REPO

## OpenCode não responde

Ações:
- valide OPENCODE_BIN
- execute opencode models manualmente
- ajuste OPENCODE_TIMEOUT_MS se necessário

---

Para um guia de operação diária, consulte FLOW.md.
Para detalhes da integração com GitHub, consulte GITHUB.md.
