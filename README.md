# 🌊 RemoteFlow

<p align="center">
  <img src="./public/images/header.png" alt="RemoteFlow Header" width="100%">
</p>

> **O fluxo de desenvolvimento que acompanha você.**

[![RemoteFlow Version](https://img.shields.io/badge/version-1.0.0-2ecc71?style=for-the-badge)](https://github.com/lennondias/remoteflow)
[![Discord Bridge](https://img.shields.io/badge/Discord-Bridge-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com)
[![Powered by OpenCode](https://img.shields.io/badge/Powered%20by-OpenCode-black?style=for-the-badge)](https://github.com/opencode)

O **RemoteFlow** é a ponte definitiva entre o seu ambiente de desenvolvimento local e a ubiquidade do Discord. Ele permite interagir com agentes de IA (via OpenCode CLI) diretamente do seu telemóvel ou tablet, como se estivesse sentado à frente do seu computador.

---

## 🚀 A Ideia: Liberte o seu Código

Já sentiu que as suas melhores ideias surgem quando está longe da secretária? O **RemoteFlow** resolve o problema de estar "preso ao físico", transformando a sua máquina de desenvolvimento numa **estação de controlo remoto acessível de qualquer lugar**.

### 🔗 Como funciona o fluxo:
1. **Input:** Envia um comando `/plan` ou `/build` através de uma thread no Discord.
2. **Bridge:** O bot **RemoteFlow** capta a mensagem e comunica via WebSockets com a sua máquina local.
3. **Execução:** O **OpenCode CLI** processa a tarefa, analisa o código e executa os builds.
4. **Feedback:** O resultado volta em tempo real para o seu telemóvel através do chat.

---

## 🛠️ Stack Técnica
- **Runtime:** Node.js 🟢
- **Interface:** Discord API (Discord.js) 👾
- **Core Engine:** OpenCode CLI 🤖
- **Comunicação:** WebSockets para baixa latência e segurança ⚡

---

## 📦 Instalação Rápida

1. **Clone o repositório:**
  ```bash
  git clone https://github.com/lennondias/remoteflow.git
  cd remoteflow
  ```

2. **Instale as dependências:**
  ```bash
  npm install
  ```

3. **Configure o seu .env:**
  Crie um ficheiro `.env` com as suas credenciais (veja `.env.example`).

4. **Inicie o Flow:**
  ```bash
  npm start
  ```

---

## 🧠 Comandos Principais

| Comando | Descrição |
|---|---|
| `/plan` | Solicita à IA um plano detalhado de implementação para uma nova funcionalidade. |
| `/build` | Executa a construção, refatoração ou correção de código na máquina local. |
| `/status` | Verifica a saúde da ligação e a disponibilidade do seu host local. |

---

## 🐙 Integração com GitHub

O RemoteFlow possui integração nativa com o GitHub via [Octokit](https://github.com/octokit/octokit.js), permitindo criar Pull Requests, listar Issues e publicar reviews diretamente a partir do Discord — sem sair do telemóvel.

### ⚙️ Configuração

**1. Crie um Personal Access Token no GitHub:**

Acesse [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**.

Escopos necessários:
- ✅ `repo` — acesso completo a repositórios públicos e privados

**2. Adicione ao seu `.env`:**

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Opcionais — usados como fallback quando o projeto não tem git remote
GITHUB_DEFAULT_OWNER=seu-usuario-ou-org
GITHUB_DEFAULT_REPO=nome-do-repositorio

# Opcionais — autoria dos commits automatizados
GIT_AUTHOR_NAME=RemoteFlow Bot
GIT_AUTHOR_EMAIL=bot@remote-flow.local
```

---

### 📋 Comandos disponíveis

#### `/pr` — Pull Requests

| Comando | Descrição |
|---------|-----------|
| `/pr create [title] [base] [branch] [draft]` | Cria branch, commit, push e Pull Request a partir das mudanças da sessão actual |
| `/pr list [project] [state]` | Lista Pull Requests do repositório (`open` / `closed` / `all`) |
| `/pr review <number> [project] [model]` | Inicia sessão de revisão com agente `plan`; ao concluir, oferece botão para publicar o review no GitHub |

**Exemplos:**

```
/pr create title:feat: autenticação JWT base:main
/pr list project:minha-api state:open
/pr review number:42
```

#### `/issue` — Issues

| Comando | Descrição |
|---------|-----------|
| `/issue list [project] [label]` | Lista issues abertas, com filtro opcional por label |
| `/issue implement <number> <project> [model]` | Busca os detalhes da issue e inicia sessão `build` com contexto completo |

**Exemplos:**

```
/issue list project:minha-api label:enhancement
/issue implement number:17 project:minha-api
```

---

### 🔍 Detecção automática do repositório

O bot lê automaticamente o remote `origin` do directório do projecto:

```
git remote get-url origin
→ https://github.com/owner/repo.git
→ git@github.com:owner/repo.git
```

Ambos os formatos (HTTPS e SSH) são suportados para detecção. Se o projecto não tiver remote configurado, o bot usa `GITHUB_DEFAULT_OWNER` e `GITHUB_DEFAULT_REPO` do `.env` como fallback.

> **Nota:** O push autenticado requer que o remote seja HTTPS. Repositórios com remote SSH continuam a funcionar para detecção, mas o push deve ser feito por um remote HTTPS configurado.

---

### 🔄 Fluxo completo: Issue → PR

Exemplo de ciclo de desenvolvimento remoto completo, do telemóvel:

**Passo 1 — Descobrir o que há para fazer:**
```
/issue list project:minha-api
→ #17 · feat: adicionar autenticação JWT · enhancement
→ #18 · bug: crash ao fazer logout · bug
```

**Passo 2 — Iniciar implementação:**
```
/issue implement number:17 project:minha-api
```
O bot cria uma thread `🔨 Build · minha-api · #17` e inicia o agente `build` com o título e body da issue como contexto inicial. Interaja normalmente na thread até o trabalho estar concluído.

**Passo 3 — Criar o Pull Request:**
```
/pr create title:"feat: autenticação JWT" base:main
```
O bot faz commit das mudanças, push para o GitHub e abre o PR automaticamente. Recebe o link directo na thread.

**Passo 4 — (Opcional) Pedir revisão ao agente:**
```
/pr review number:42
```
Uma nova sessão `plan` analisa o diff do PR e apresenta os pontos de atenção. Ao concluir, um botão **"Publicar Review no GitHub"** aparece na thread — um clique e o review está publicado.

---

## 🚧 Roadmap

- [ ] Suporte para múltiplos agentes em simultâneo.
- [ ] Interface visual para monitorização de logs remotos em tempo real.
- [ ] Integração nativa com GitHub PRs através de threads de discussão.

---

## 🤝 Contribuições

O RemoteFlow é um projeto de código aberto. Sinta-se à vontade para abrir Issues ou enviar Pull Requests.

Consulte o nosso `CONTRIBUTING.md` para mais detalhes.

---

Desenvolvido para quem não quer que a criatividade fique presa a uma cadeira.