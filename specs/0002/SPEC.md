# SPEC-0002 — RemoteFlow: Integração com GitHub

> **Status:** Draft  
> **Versão:** 1.4.0  
> **Data:** 2026-03-22  
> **Autor:** Gerado via sessão de design colaborativo  
> **Depende de:** SPEC-0001 (RemoteFlow v1.0)

---

## 1. Visão Geral

A integração com GitHub expande o **RemoteFlow** com capacidade de interagir diretamente com repositórios GitHub a partir do Discord. O objetivo é fechar o ciclo de desenvolvimento remoto: o desenvolvedor não precisa apenas de rodar agentes de IA — precisa também de criar branches, commitar mudanças, abrir Pull Requests e rastrear Issues, tudo sem sair do telemóvel.

Esta especificação cobre dois novos módulos (`src/git.js` e `src/github.js`), cinco novos slash commands (`/pr create`, `/pr list`, `/pr review`, `/issue list`, `/issue implement`) e as variáveis de ambiente necessárias para autenticação e configuração de fallback.

---

## 2. Contexto e Motivação

### Situação após v1.0

Com o RemoteFlow v1.0, o desenvolvedor consegue:
1. Iniciar sessões `plan` e `build` remotamente
2. Interagir conversacionalmente com o agente via thread Discord
3. Acompanhar o output em tempo real

O que ainda falta para completar o fluxo remoto:
- **Não há como commitar o trabalho do agente** — o desenvolvedor precisa voltar ao computador para fazer `git commit` e `git push`
- **Não há visibilidade de Issues** — context do que está pendente não entra automaticamente nas sessões
- **Não há como abrir um PR** sem acesso ao terminal local

### Objetivo

Transformar o RemoteFlow num ambiente de desenvolvimento **completamente autônomo via mobile**, incluindo a ponte entre o trabalho do agente e o repositório remoto no GitHub.

---

## 3. Requisitos

### 3.1 Funcionais

| ID | Requisito |
|----|-----------|
| RF-11 | O usuário deve poder criar um Pull Request a partir das mudanças da sessão atual com um único comando (`/pr create`) |
| RF-12 | O usuário deve poder listar Pull Requests abertos do repositório associado ao projeto (`/pr list`) |
| RF-13 | O usuário deve poder iniciar uma sessão de revisão de PR com agente `plan` e publicar a revisão resultante diretamente no GitHub (`/pr review`) |
| RF-14 | O usuário deve poder listar Issues abertas do repositório, com filtro opcional por label (`/issue list`) |
| RF-15 | O usuário deve poder iniciar uma sessão `build` pré-carregada com o contexto completo de uma Issue (`/issue implement`) |
| RF-16 | O bot deve detectar automaticamente o owner e repositório GitHub a partir do `git remote get-url origin` do diretório do projeto |
| RF-17 | Quando a detecção automática falhar ou o projeto não tiver remote configurado, o bot deve usar `GITHUB_DEFAULT_OWNER` e `GITHUB_DEFAULT_REPO` como fallback |
| RF-18 | Toda operação GitHub (criação de PR, publicação de review, criação de branch) deve ser registrada no log do bot com nível `info`, incluindo usuário Discord, projeto e identificador do recurso criado |

### 3.2 Não-funcionais

| ID | Requisito |
|----|-----------|
| RNF-07 | O token GitHub não deve nunca permanecer embutido na URL do remote após a operação de push — a URL original deve ser restaurada no bloco `finally`, mesmo em caso de erro |
| RNF-08 | O diff de um PR deve ser truncado em 80 KB antes de ser enviado ao agente de IA, para evitar estourar o contexto do modelo |
| RNF-09 | O contexto de revisão de PR (diff + metadados) deve ser mantido em memória numa `Map` com chave `sessionId`, limpa quando a sessão for encerrada |

### 3.3 Fora de escopo (v1.4)

- Criação de Issues via Discord
- Gestão de milestones e projetos GitHub
- Merge de PRs diretamente pelo bot
- Suporte a GitLab ou Bitbucket
- Webhooks GitHub → Discord (notificações push)

---

## 4. Arquitetura

### 4.1 Visão de alto nível — novos módulos

```
┌─────────────────────────────────────────────────────────┐
│                  Bot Process (Node.js)                  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  commands.js — novos handlers                   │    │
│  │                                                 │    │
│  │  handlePrCreate()     handlePrList()            │    │
│  │  handlePrReview()     handleIssueList()         │    │
│  │  handleIssueImplement()                         │    │
│  └──────────┬──────────────────┬───────────────────┘    │
│             │                  │                        │
│             ▼                  ▼                        │
│  ┌──────────────────┐  ┌───────────────────────────┐    │
│  │   src/git.js     │  │     src/github.js         │    │
│  │                  │  │                           │    │
│  │  getBranch()     │  │  GitHubClient (Octokit)   │    │
│  │  commit()        │  │  createPullRequest()      │    │
│  │  push()          │  │  listPullRequests()       │    │
│  │  getRemoteUrl()  │  │  getPullRequestDiff()     │    │
│  │  parseOwnerRepo()│  │  createReview()           │    │
│  └──────────────────┘  │  listIssues()             │    │
│                        │  getIssue()               │    │
│                        └───────────┬───────────────┘    │
│                                    │ HTTPS              │
└────────────────────────────────────┼────────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │    GitHub API v3     │
                          │  api.github.com      │
                          └─────────────────────┘
```

### 4.2 Módulo `src/git.js`

Camada fina sobre o binário `git` local. Executa operações git via `child_process.execFile` de forma assíncrona. Não depende de bibliotecas externas além da stdlib Node.js.

**Responsabilidades:**
- Obter o nome do branch atual
- Fazer commit das mudanças staged com autoria configurável
- Fazer push para o remote (embutindo token na URL apenas durante o push)
- Extrair owner e repositório a partir da URL do remote
- Limpar URL do remote no bloco `finally` (RNF-07)

### 4.3 Módulo `src/github.js`

Cliente Octokit encapsulado numa classe `GitHubClient`. Autenticado via `GITHUB_TOKEN`. Toda operação é assíncrona e lança erros descritivos em caso de falha.

**Responsabilidades:**
- Criar Pull Requests (RF-11)
- Listar Pull Requests com filtro por estado (RF-12)
- Obter diff de um PR (truncado em 80 KB — RNF-08)
- Publicar reviews em PRs existentes (RF-13)
- Listar Issues abertas com filtro por label (RF-14)
- Buscar detalhes de uma Issue específica (RF-15)

### 4.4 Fluxo: `/pr create`

```
Usuário: /pr create title:"feat: módulo de auth" base:main

commands.js: handlePrCreate()
  ├── Busca sessão ativa na thread atual
  ├── git.getBranch() — obtém branch atual
  ├── git.commit({ message, author }) — commita mudanças staged
  ├── git.push({ branch, token }) — push com token embutido na URL
  │     └── [finally] restaura URL original do remote
  ├── github.createPullRequest({ title, head, base, draft })
  └── Responde na thread com embed contendo URL do PR criado
```

### 4.5 Fluxo: `/pr review`

```
Usuário: /pr review number:42

commands.js: handlePrReview()
  ├── github.getPullRequestDiff(42) — truncado em 80KB (RNF-08)
  ├── sessionManager.create({ type: 'plan', projectPath, threadId })
  ├── Injeta diff + metadados do PR no contexto da sessão
  ├── reviewContextMap.set(sessionId, { prNumber, diff })  ← RNF-09
  ├── StreamHandler inicia — agente plan recebe o diff
  └── Ao encerrar sessão, exibe botão "Publicar Review no GitHub"
        └── [onClick] github.createReview({ prNumber, body, event: 'COMMENT' })
```

### 4.6 Fluxo: `/issue implement`

```
Usuário: /issue implement number:17 project:minha-api

commands.js: handleIssueImplement()
  ├── github.getIssue(17) — título, body, labels, assignees
  ├── Formata contexto: "Issue #17: [título]\n\n[body]"
  ├── sessionManager.create({ type: 'build', projectPath, threadId })
  └── Injeta contexto da issue como prompt inicial da sessão
```

---

## 5. Estrutura de Arquivos

```
remote-flow/
│
├── src/
│   ├── index.js              # Sem alterações (v1.0)
│   ├── session-manager.js    # Sem alterações (v1.0)
│   ├── stream-handler.js     # Sem alterações (v1.0)
│   ├── commands.js           # ← Adicionados handlers /pr e /issue
│   ├── git.js                # ← NOVO: utilitários git
│   └── github.js             # ← NOVO: cliente Octokit
│
├── specs/
│   ├── 0001/
│   │   └── SPEC.md           # Especificação original (v1.0)
│   └── 0002/
│       └── SPEC.md           # Este documento
```

---

## 6. Componentes

### 6.1 `git.js` — Funções exportadas

| Função | Parâmetros | Retorno | Descrição |
|--------|------------|---------|-----------|
| `getBranch(projectPath)` | `string` | `Promise<string>` | Retorna nome do branch atual |
| `commit(projectPath, message, author)` | `string, string, {name, email}` | `Promise<void>` | Cria commit com autoria configurada |
| `push(projectPath, branch, token)` | `string, string, string` | `Promise<void>` | Push com token embutido; restaura URL no `finally` |
| `getRemoteUrl(projectPath)` | `string` | `Promise<string>` | Retorna URL do remote `origin` |
| `parseOwnerRepo(remoteUrl)` | `string` | `{ owner: string, repo: string }` | Extrai owner/repo de URL SSH ou HTTPS |

**Tratamento de segurança (`push`):**

```js
// Embutir token apenas durante o push
const originalUrl = await getRemoteUrl(projectPath);
const authedUrl = originalUrl.replace('https://', `https://${token}@`);
await execGit(['remote', 'set-url', 'origin', authedUrl], projectPath);
try {
  await execGit(['push', 'origin', branch], projectPath);
} finally {
  // RNF-07: restaurar URL limpa mesmo em caso de erro
  await execGit(['remote', 'set-url', 'origin', originalUrl], projectPath);
}
```

### 6.2 `GitHubClient` (github.js)

Classe singleton autenticada com `GITHUB_TOKEN`.

**Métodos:**

| Método | Parâmetros | Retorno | Descrição |
|--------|------------|---------|-----------|
| `createPullRequest({ owner, repo, title, head, base, body, draft })` | object | `Promise<{ number, url }>` | Cria PR e retorna número e URL |
| `listPullRequests({ owner, repo, state })` | object | `Promise<PR[]>` | Lista PRs (`open`, `closed`, `all`) |
| `getPullRequestDiff({ owner, repo, number })` | object | `Promise<string>` | Retorna diff truncado em 80KB (RNF-08) |
| `createReview({ owner, repo, pullNumber, body, event })` | object | `Promise<void>` | Publica review (`COMMENT`, `APPROVE`, `REQUEST_CHANGES`) |
| `listIssues({ owner, repo, label, state })` | object | `Promise<Issue[]>` | Lista issues com filtro opcional |
| `getIssue({ owner, repo, number })` | object | `Promise<Issue>` | Retorna detalhes completos de uma issue |

### 6.3 Comandos Discord — `/pr`

| Comando | Opções | Comportamento |
|---------|--------|---------------|
| `/pr create` | `title` (obrigatório), `base` (padrão: `main`), `branch` (padrão: branch atual), `draft` (booleano) | Cria branch+commit+push+PR. Responde com embed contendo URL do PR. |
| `/pr list` | `project` (opcional), `state` (open/closed/all, padrão: open) | Lista PRs do repositório associado ao projeto. Exibe número, título, autor e data. |
| `/pr review` | `number` (obrigatório), `project` (opcional), `model` (opcional) | Abre sessão `plan` com diff do PR injetado. Ao concluir, exibe botão para publicar review. |

### 6.4 Comandos Discord — `/issue`

| Comando | Opções | Comportamento |
|---------|--------|---------------|
| `/issue list` | `project` (opcional), `label` (opcional) | Lista issues abertas. Exibe número, título, labels e data de abertura. |
| `/issue implement` | `number` (obrigatório), `project` (obrigatório), `model` (opcional) | Busca issue e inicia sessão `build` com título+body injetados como prompt inicial. |

### 6.5 Detecção de repositório (RF-16 / RF-17)

A função `resolveOwnerRepo(projectPath)` em `git.js` aplica a seguinte lógica:

```
1. Tenta: git remote get-url origin → parseOwnerRepo(url)
2. Se falhar ou retornar vazio → usa GITHUB_DEFAULT_OWNER + GITHUB_DEFAULT_REPO
3. Se ambos falharem → lança erro: "Repositório GitHub não identificado. Configure GITHUB_DEFAULT_OWNER e GITHUB_DEFAULT_REPO no .env"
```

---

## 7. Configuração

### 7.1 Novas variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `GITHUB_TOKEN` | ✅ | — | Personal Access Token com escopo `repo` |
| `GITHUB_DEFAULT_OWNER` | | — | Owner do repositório fallback (usuário ou organização) |
| `GITHUB_DEFAULT_REPO` | | — | Nome do repositório fallback |
| `GIT_AUTHOR_NAME` | | `RemoteFlow Bot` | Nome do autor nos commits automatizados |
| `GIT_AUTHOR_EMAIL` | | `bot@remote-flow.local` | E-mail do autor nos commits automatizados |

### 7.2 Como gerar o GitHub Personal Access Token

1. Acesse [github.com/settings/tokens](https://github.com/settings/tokens)
2. Clique em **Generate new token (classic)**
3. Selecione o escopo **`repo`** (acesso completo a repositórios privados e públicos)
4. Copie o token e adicione ao `.env`:
   ```env
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 7.3 Variáveis de ambiente completas (v1.4)

Inclui todas as variáveis de SPEC-0001, acrescidas de:

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `DISCORD_TOKEN` | ✅ | — | Token do bot Discord |
| `DISCORD_GUILD_ID` | ✅ | — | ID do servidor Discord |
| `PROJECTS_BASE_PATH` | ✅ | — | Caminho base dos projetos Windows |
| `GITHUB_TOKEN` | ✅ | — | Personal Access Token GitHub (escopo `repo`) |
| `OPENCODE_BIN` | | `opencode` | Executável do opencode |
| `ALLOWED_USER_IDS` | | (todos) | IDs Discord autorizados, separados por vírgula |
| `DISCORD_MSG_LIMIT` | | `1900` | Limite de chars por mensagem |
| `STREAM_UPDATE_INTERVAL` | | `1500` | Intervalo de atualização em ms |
| `GITHUB_DEFAULT_OWNER` | | — | Owner fallback quando git remote não disponível |
| `GITHUB_DEFAULT_REPO` | | — | Repositório fallback quando git remote não disponível |
| `GIT_AUTHOR_NAME` | | `RemoteFlow Bot` | Nome do autor em commits automatizados |
| `GIT_AUTHOR_EMAIL` | | `bot@remote-flow.local` | E-mail do autor em commits automatizados |

---

## 8. Fluxos de Uso

### 8.1 Fluxo completo: Issue → PR

```
[iPhone - Discord]

1. Usuário: /issue list project:minha-api
   Bot: 📋 Issues abertas — minha-api
        #17 · feat: adicionar autenticação JWT · labels: enhancement
        #18 · bug: crash ao fazer logout · labels: bug

2. Usuário: /issue implement number:17 project:minha-api
   [Bot cria thread: "🔨 Build · minha-api · #17 · 14:32"]
   Bot: [embed] Sessão Build — minha-api | Issue #17: feat: adicionar autenticação JWT
   Bot: ⚙️ Processando...
   Bot: ```
        Entendido. Vou implementar a autenticação JWT conforme a issue.
        Analisando o projeto...
        ```
   ... [sessão de desenvolvimento]
   Bot: ✅ Sessão concluída

3. Usuário: /pr create title:"feat: autenticação JWT" base:main
   Bot: ✅ Pull Request criado!
        🔗 github.com/owner/minha-api/pull/42
        Branch: feat/jwt-auth → main
        Status: Open (draft: não)
```

### 8.2 Fluxo: Revisão de PR com publicação

```
[iPhone - Discord]

1. Usuário: /pr list project:minha-api
   Bot: 📤 Pull Requests abertos — minha-api
        #42 · feat: autenticação JWT · por: RemoteFlow Bot · 2 min atrás
        #38 · refactor: reorganizar middlewares · por: dev · 3 dias atrás

2. Usuário: /pr review number:42
   [Bot cria thread: "📋 Plan · PR #42 · 14:45"]
   Bot: [embed] Revisão de PR #42 — feat: autenticação JWT
   Bot: ⚙️ Analisando diff (2.3KB de 80KB máx)...
   Bot: ```
        Analisando o Pull Request #42...
        Encontrei 3 pontos de atenção:
        1. O token JWT não tem expiração configurada
        2. O middleware de auth não trata erros de token malformado
        3. Falta validação do campo `sub` no payload
        ```
   Bot: ✅ Revisão concluída
        [Publicar Review no GitHub]

3. Usuário: [clica em "Publicar Review no GitHub"]
   Bot: ✅ Review publicado no PR #42!
        🔗 github.com/owner/minha-api/pull/42#pullrequestreview-...
```

### 8.3 Fluxo: Listar e criar PR draft

```
[iPhone - Discord — dentro de uma thread de build ativa]

Usuário: /pr create title:"WIP: refatorar middlewares" draft:true base:develop

Bot: ✅ Pull Request (draft) criado!
     🔗 github.com/owner/minha-api/pull/43
     Branch: refactor/middlewares → develop
     Status: Draft
```

---

## 9. Segurança

### 9.1 Proteção do token GitHub (RNF-07)

O `GITHUB_TOKEN` nunca é armazenado na URL do remote de forma permanente. A sequência de operações no `push` segue o padrão:

```
1. Lê URL original         → getRemoteUrl()
2. Cria URL com token      → url.replace('https://', 'https://TOKEN@')
3. Atualiza remote         → git remote set-url origin URL_COM_TOKEN
4. Executa push            → git push origin BRANCH
5. [finally] Restaura URL  → git remote set-url origin URL_ORIGINAL
```

O bloco `finally` garante que a URL é limpa mesmo se o push falhar, prevenindo que o token fique exposto no output de `git remote -v`.

### 9.2 Truncamento de diff (RNF-08)

Diffs muito grandes podem exceder o contexto do modelo de IA ou causar respostas degradadas. O `getPullRequestDiff()` aplica:

```js
const MAX_DIFF_BYTES = 80 * 1024; // 80KB
if (Buffer.byteLength(diff, 'utf8') > MAX_DIFF_BYTES) {
  const truncated = Buffer.from(diff, 'utf8').slice(0, MAX_DIFF_BYTES).toString('utf8');
  return truncated + '\n\n[... diff truncado em 80KB ...]';
}
```

### 9.3 Contexto de revisão em memória (RNF-09)

O mapa `reviewContextMap` é local ao módulo `commands.js`:

```js
// Map<sessionId, { prNumber, prTitle, diff, owner, repo }>
const reviewContextMap = new Map();
```

Entradas são removidas no handler do evento `session.close`, evitando vazamento de memória em sessões de longa duração.

---

## 10. Decisões de Design

### Por que Octokit e não chamadas HTTP diretas?

| Critério | Octokit | fetch direto |
|----------|---------|--------------|
| Autenticação automática | ✅ Via construtor | ❌ Header manual em cada request |
| Rate limit e retry | ✅ Plugin automático | ❌ Implementação manual |
| TypeScript types | ✅ Completo | ❌ Nenhum |
| Paginação | ✅ Abstraída | ❌ Manual |
| Manutenção | ✅ GitHub oficial | ❌ Frágil a mudanças de API |

O Octokit é a biblioteca oficial do GitHub, mantida pelo próprio GitHub, e elimina todo o boilerplate de autenticação e paginação.

### Por que `git` CLI e não libgit2/nodegit?

- `nodegit` requer compilação de módulos nativos — frágil no Windows (mesmo problema que PTY)
- O binário `git` está sempre disponível em máquinas de desenvolvimento
- As operações necessárias (branch, commit, push, remote) são simples e bem suportadas via CLI
- Consistência com a abordagem já adotada para `opencode` (spawn de processo)

### Por que truncar diff em 80KB e não em número de tokens?

- Contagem de tokens depende do modelo — não é conhecida em tempo de execução sem uma chamada extra à API
- 80KB é uma heurística conservadora que funciona para todos os modelos suportados
- Prefere simplicidade e ausência de dependências extra (sem biblioteca de tokenização)

---

## 11. Limitações Conhecidas (v1.4)

| Limitação | Impacto | Mitigação |
|-----------|---------|-----------|
| Push requer que o remote seja HTTPS | Repositórios com remote SSH não funcionam com token embutido | Documentado; usuário deve configurar remote HTTPS ou usar `GIT_SSH_COMMAND` |
| Sem suporte a 2FA no git push | PAT substitui senha; 2FA no GitHub não afeta PAT | Sem impacto — PAT é o mecanismo correto |
| Review publicado sempre como `COMMENT` | Não aprova nem solicita mudanças automaticamente | Aceitável — bot não deve tomar decisões de merge |
| Contexto de review perde-se ao reiniciar o bot | Botão "Publicar Review" para de funcionar após restart | Impacto baixo — revisões geralmente concluídas em minutos |
| Sem suporte a repositórios privados em organizações com SSO | PAT clássico pode precisar de autorização SSO extra | Documentado; usuário deve autorizar o PAT para a org |

---

## 12. Roadmap

### v1.5
- [ ] Comando `/pr merge` para fazer merge de PR aprovado
- [ ] Suporte a remote SSH com chave configurável via `GIT_SSH_KEY_PATH`
- [ ] Notificação por DM quando PR recebe review de outro colaborador (webhook GitHub → Discord)

### v2.0
- [ ] Criação de Issues diretamente pelo Discord
- [ ] Suporte a GitLab (adapter pattern sobre `github.js`)
- [ ] Dashboard web com visualização de PRs e Issues por projeto

---

## 13. Glossário

| Termo | Definição |
|-------|-----------|
| **Octokit** | Biblioteca oficial do GitHub para interação com a API REST v3 |
| **PAT** | Personal Access Token — credencial GitHub usada em lugar de senha para operações autenticadas |
| **Pull Request (PR)** | Proposta de merge de uma branch para outra no GitHub |
| **Issue** | Registro de tarefa, bug ou feature request no GitHub |
| **Review** | Comentário formal sobre um PR, podendo ser `COMMENT`, `APPROVE` ou `REQUEST_CHANGES` |
| **Remote URL** | Endereço do repositório remoto configurado no git local (`git remote get-url origin`) |
| **Draft PR** | Pull Request marcado como rascunho — indica trabalho em progresso, bloqueia merge |
| **reviewContextMap** | Estrutura em memória que mantém o diff e metadados do PR durante a sessão de revisão |
