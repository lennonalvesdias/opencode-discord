# OpenCode Discord Bridge

> Use o `opencode` CLI do seu Windows pelo iPhone, via Discord.

Bot Discord que expõe seus agentes `plan` e `build` do OpenCode como sessões interativas em threads — replicando no celular a mesma experiência conversacional que você tem no terminal.

---

## Como funciona

```
iPhone (Discord) ──WebSocket──▶ Bot (Windows) ──spawn──▶ opencode CLI
                 ◀─────────────  stdout em tempo real
```

O bot roda **localmente no seu Windows**, conecta ao Discord via WebSocket (sem abrir portas), e para cada `/plan` ou `/build` cria uma thread Discord com streaming do output em tempo real. Você responde ao agente digitando na thread.

## Pré-requisitos

- Windows 10/11
- Node.js 18+
- `opencode` instalado e no PATH
- Conta Discord + bot criado no [Developer Portal](https://discord.com/developers/applications)

## Setup rápido

```powershell
# 1. Instale dependências
npm install

# 2. Configure
copy .env.example .env
# Edite .env com as variáveis conforme seção "Configuração (.env)"

# 3. Teste
node src/index.js

# 4. (Opcional) Instale como serviço Windows
# Execute o PowerShell como Administrador:
powershell -ExecutionPolicy Bypass -File scripts\install-service.ps1
```

## Comandos Discord

| Comando | O que faz |
|---------|-----------|
| `/plan [projeto] [prompt]` | Inicia sessão de planejamento |
| `/build [projeto] [prompt]` | Inicia sessão de desenvolvimento |
| `/sessoes` | Lista sessões ativas |
| `/status` | Status da sessão na thread atual |
| `/parar` | Encerra sessão da thread atual |
| `/projetos` | Lista projetos disponíveis |

Dentro de qualquer thread de sessão, **qualquer mensagem** é enviada diretamente ao stdin do OpenCode.

## Múltiplas sessões

Cada sessão roda em sua própria thread Discord, completamente isolada. Você pode ter várias sessões abertas simultaneamente em projetos diferentes.

---

## Configuração (.env)

### Referência rápida

| Variável | Obrigatório | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `DISCORD_TOKEN` | ✅ | — | Token do bot Discord |
| `DISCORD_GUILD_ID` | ✅ | — | ID do servidor Discord |
| `PROJECTS_BASE_PATH` | ✅ | — | Caminho base dos projetos |
| `DISCORD_CLIENT_ID` | ❌ | (auto) | Application ID do bot |
| `OPENCODE_BIN` | ❌ | `opencode` | Caminho para executável |
| `ALLOWED_USER_IDS` | ❌ | (vazio) | IDs de usuários autorizados |
| `DISCORD_ALLOWED_CHANNEL_ID` | ❌ | (vazio) | Restringe a um canal |
| `DISCORD_MSG_LIMIT` | ❌ | `1900` | Máx. caracteres por mensagem |
| `STREAM_UPDATE_INTERVAL` | ❌ | `1500` | Intervalo de atualização (ms) |

---

### Passo a passo

#### 1. `DISCORD_TOKEN` (obrigatório)

Este é o token secreto que autoriza o bot a se conectar ao Discord.

**Passos:**

1. Acesse [Discord Developer Portal](https://discord.com/developers/applications)
2. Clique em **"New Application"** e dê um nome ao bot
3. Na barra lateral esquerda, abra a aba **"Bot"**
4. Clique em **"Reset Token"**, confirme, e **copie o token**
5. Abra a aba **"Privileged Gateway Intents"** e habilite **"Message Content Intent"** (necessário para ler mensagens nas threads)
6. Agora que o token está copiado, você precisará convidar o bot ao seu servidor:
   - Vá para a aba **"OAuth2"** → **"URL Generator"**
   - Em "Scopes", selecione: `bot` e `applications.commands`
   - Em "Permissions", selecione:
     - ✅ Enviar mensagens
     - ✅ Criar tópicos públicos
     - ✅ Enviar mensagens em tópicos
     - ✅ Ver histórico de mensagens
     - ✅ Adicionar reações
     - ✅ Inserir links
      - ✅ Usar comandos de barra
   - Copie a URL gerada e abra em seu navegador para convidar o bot ao servidor
7. Cole o token no `.env`:

```env
DISCORD_TOKEN=seu_token_aqui
```

---

#### 2. `DISCORD_GUILD_ID` (obrigatório)

Este é o ID do seu servidor Discord (também chamado de "guild").

**Passos:**

1. Abra Discord
2. Vá para **Settings** (no canto inferior esquerdo) → **Advanced** → habilite **"Developer Mode"**
3. Feche Settings e clique com botão direito no **nome do servidor** (no topo da lista de canais)
4. Selecione **"Copy Server ID"**
5. Cole no `.env`:

```env
DISCORD_GUILD_ID=123456789012345678
```

---

#### 3. `DISCORD_CLIENT_ID` (opcional, recomendado na primeira execução)

Este é o "Application ID" do seu bot. É necessário apenas para registrar os slash commands no seu servidor na primeira vez que o bot inicia.

**Passos:**

1. Acesse [Discord Developer Portal](https://discord.com/developers/applications)
2. Abra sua aplicação (o bot que criou no passo 1 do `DISCORD_TOKEN`)
3. Na aba **"General Information"**, copie o **"Application ID"**
4. Descomente e cole no `.env`:

```env
DISCORD_CLIENT_ID=123456789012345678
```

> **Nota:** Após a primeira execução, você pode deixar comentado ou remover. O bot detecta automaticamente depois.

---

#### 4. `PROJECTS_BASE_PATH` (obrigatório)

Este é o caminho completo da pasta que contém seus projetos. O bot listará cada subpasta como um projeto selecionável nos comandos `/plan` e `/build`.

**Exemplo prático:**

Se seus projetos estão assim:

```
C:\Users\lenno\Projects\
  ├── projeto-a\
  ├── projeto-b\
  └── projeto-c\
```

Configure:

```env
PROJECTS_BASE_PATH=C:\Users\lenno\Projects
```

Agora, quando usar `/plan`, o bot mostrará: `projeto-a`, `projeto-b`, `projeto-c`.

**Passos:**

1. Abra o File Explorer
2. Navegue até a pasta que contém seus projetos
3. Clique na barra de endereço e copie o caminho (pode usar `\` ou `/` — ambos funcionam)
4. Cole no `.env`:

```env
PROJECTS_BASE_PATH=C:\Users\lenno\Projects
```

---

#### 5. `OPENCODE_BIN` (opcional, padrão: `opencode`)

Caminho para o executável do `opencode`. Se o comando `opencode` funciona no seu PowerShell/CMD, deixe como está.

**Para verificar:** Abra PowerShell e execute:

```powershell
opencode --version
```

Se funcionar, não mude nada. Se não funcionar, você precisa do caminho completo.

**Para encontrar o caminho:**

1. Abra PowerShell como administrador
2. Execute: `get-command opencode` ou procure em `C:\Users\SeuUsuário\AppData\Roaming\npm\`
3. Cole o caminho completo no `.env`:

```env
OPENCODE_BIN=C:\Users\lenno\AppData\Roaming\npm\opencode.cmd
```

---

#### 6. `ALLOWED_USER_IDS` (opcional, mas recomendado)

Restringe o uso do bot a usuários específicos do Discord. Deixe vazio para permitir qualquer membro do servidor.

**Passos:**

1. Abra Discord e vá para **Settings** → **Advanced** → habilite **"Developer Mode"** (se ainda não fez)
2. Clique com botão direito no seu nome de usuário e selecione **"Copy User ID"**
3. Cole no `.env`. Para múltiplos usuários, separe com vírgula:

```env
ALLOWED_USER_IDS=123456789012345678
```

Ou:

```env
ALLOWED_USER_IDS=123456789012345678,987654321098765432
```

> **Deixar vazio:** Se remover esta linha ou deixar em branco, o bot aceita comandos de qualquer membro do servidor.

---

#### 7. `DISCORD_ALLOWED_CHANNEL_ID` (opcional)

Restringe o bot a aceitar mensagens apenas de threads criadas dentro de um canal específico. Útil se você quer usar o bot apenas em um canal dedicado.

**Passos:**

1. Clique com botão direito no canal desejado
2. Selecione **"Copy Channel ID"**
3. Descomente e cole no `.env`:

```env
DISCORD_ALLOWED_CHANNEL_ID=123456789012345678
```

> **Deixar comentado:** Se remover o `#` ou deixar vazio, o bot aceita de qualquer canal.

---

#### 8. `DISCORD_MSG_LIMIT` (opcional, padrão: `1900`)

Limite máximo de caracteres por mensagem Discord. O Discord tem limite rígido de 2000 caracteres; o padrão de 1900 deixa margem para formatação de blocos de código.

```env
DISCORD_MSG_LIMIT=1900
```

> Não precisa mudar a menos que você saiba o que está fazendo.

---

#### 9. `STREAM_UPDATE_INTERVAL` (opcional, padrão: `1500`)

Intervalo em milissegundos entre atualizações da mensagem durante o streaming do output. Valores menores = mais em tempo real, mas maior risco de atingir limites de rate limit do Discord (máximo 5 edições por segundo).

```env
STREAM_UPDATE_INTERVAL=1500
```

**Recomendações:**

- `1500` — padrão, seguro
- `1000` — mais rápido, mas cuidado com rate limits
- `2000` — mais lento, ideal se está recebendo erros 429

---

## Exemplo de `.env` completo

```env
# Obrigatório
DISCORD_TOKEN=MzA4NjIyNTEzOTAwMzI2OTc3.xyz123abc456def789ghijkl
DISCORD_GUILD_ID=123456789012345678
PROJECTS_BASE_PATH=C:\Users\lenno\Projects

# Recomendado na primeira execução
DISCORD_CLIENT_ID=123456789012345678

# Recomendado para segurança
ALLOWED_USER_IDS=123456789012345678

# Opcional
OPENCODE_BIN=opencode
DISCORD_ALLOWED_CHANNEL_ID=
DISCORD_MSG_LIMIT=1900
STREAM_UPDATE_INTERVAL=1500
```

---

## Especificação completa

Veja [`specs/0001/SPEC.md`](specs/0001/SPEC.md) para arquitetura detalhada, decisões de design e roadmap.
