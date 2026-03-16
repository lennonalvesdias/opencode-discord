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
# Edite .env com seu DISCORD_TOKEN, DISCORD_GUILD_ID, PROJECTS_BASE_PATH

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

## Configuração (.env)

```env
DISCORD_TOKEN=seu_token
DISCORD_GUILD_ID=id_do_servidor
PROJECTS_BASE_PATH=C:\Users\voce\projetos
OPENCODE_BIN=opencode
ALLOWED_USER_IDS=seu_user_id_discord
```

## Especificação completa

Veja [`specs/0001/SPEC.md`](specs/0001/SPEC.md) para arquitetura detalhada, decisões de design e roadmap.
