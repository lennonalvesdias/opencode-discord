# GITHUB.md — Integrações com GitHub

Este guia explica as integrações GitHub já disponíveis no RemoteFlow, como configurar autenticação e como usar os comandos no fluxo de desenvolvimento remoto.

---

## 1. O que está disponível hoje

Integrações implementadas:
- criação de Pull Request a partir da sessão atual
- listagem de Pull Requests
- revisão de Pull Request com agente e publicação do review no GitHub
- listagem de issues
- implementação de issue com contexto automático

Tudo isso é disparado por slash commands no Discord, com execução local no projeto.

---

## 2. Requisitos

- GITHUB_TOKEN configurado no .env
- Repositório local git inicializado
- Remote origin apontando para GitHub (recomendado)

Fallback suportado:
- GITHUB_DEFAULT_OWNER
- GITHUB_DEFAULT_REPO

Essas variáveis são usadas quando o projeto local não possui remote origin detectável.

---

## 3. Configuração do token

1. Acesse https://github.com/settings/tokens
2. Gere um Personal Access Token (classic ou fine-grained)
3. Garanta permissões equivalentes ao escopo repo
4. Adicione no .env:

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_DEFAULT_OWNER=seu-owner-opcional
GITHUB_DEFAULT_REPO=seu-repo-opcional
GIT_AUTHOR_NAME=RemoteFlow Bot
GIT_AUTHOR_EMAIL=bot@remote-flow.local
```

Observações:
- sem GITHUB_TOKEN, comandos GitHub ficam indisponíveis
- para push autenticado, o fluxo de PR usa remote HTTPS

---

## 4. Como o RemoteFlow resolve owner/repo

Ordem de resolução:
1. lê remote origin do projeto local
2. extrai owner/repo de URL HTTPS ou SSH
3. se falhar, usa GITHUB_DEFAULT_OWNER e GITHUB_DEFAULT_REPO

Se nenhuma opção funcionar, o comando retorna erro de contexto de repositório.

---

## 5. Comandos de Pull Request

## /pr create
Cria branch, commit, push e Pull Request com mudanças da sessão atual.

Entradas:
- title (opcional)
- base (opcional, padrão main)
- branch (opcional)
- draft (opcional)

Fluxo interno:
1. valida se há alterações git
2. cria branch novo
3. commit com autoria configurada por GIT_AUTHOR_NAME e GIT_AUTHOR_EMAIL
4. push para origin
5. cria PR via API GitHub

Resultado:
- embed com número do PR, link e metadados

## /pr list
Lista PRs por estado:
- open
- closed
- all

Pode usar projeto explícito ou inferir da sessão da thread.

## /pr review
Inicia revisão de PR com agente plan.

Fluxo:
1. busca PR, diff e arquivos alterados
2. monta prompt de revisão completo
3. cria sessão dedicada
4. ao finalizar, mostra botão para publicar review
5. botão publica review no PR

Mapeamento automático de veredicto:
- APPROVE
- REQUEST_CHANGES
- COMMENT

---

## 6. Comandos de Issues

## /issue list
Lista issues abertas do repositório.

Filtro opcional:
- label

## /issue implement
Busca uma issue específica e inicia sessão build com:
- título
- labels
- autor
- corpo da issue

Após implementação, o fluxo recomendado é criar PR com /pr create.

---

## 7. Limites e comportamento

- sem GITHUB_TOKEN: comandos GitHub retornam erro amigável
- issues e PRs são limitados por paginação interna (até 15 itens por listagem)
- listagem de issues exclui PRs automaticamente
- em /pr review, diffs muito grandes podem ser truncados

---

## 8. Erros comuns e solução

## Token inválido (401)
Ação:
- regenerar token
- atualizar GITHUB_TOKEN no .env

## Permissão insuficiente (403)
Ação:
- revisar permissões equivalentes ao escopo repo

## Recurso não encontrado (404)
Ação:
- validar owner/repo
- confirmar acesso ao repositório

## Entidade inválida (422)
Exemplos comuns:
- branch já existe
- PR duplicado

Ação:
- informar branch diferente em /pr create
- revisar estado atual do repositório

## Falha de push com remote SSH
Ação:
- configurar remote HTTPS para autenticação por token

---

## 9. Fluxos recomendados

## Issue para PR

1. /issue list project:minha-api
2. /issue implement number:17 project:minha-api
3. validar mudanças com /diff
4. /pr create title:feat: issue 17

## PR review assistido por agente

1. /pr review number:42 project:minha-api
2. aguardar análise
3. clicar em Publicar Review no GitHub

---

Para instalação e variáveis de ambiente, consulte INSTALL.md.
Para tutorial operacional completo dos comandos, consulte FLOW.md.
