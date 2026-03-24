# OpenCode Serve API — Permission Management Research Report

**Research Date:** 2026-03-24  
**Status:** Complete  
**Researcher:** File Search Specialist

---

## Executive Summary

The RemoteFlow codebase implements an **interactive permission approval system** for OpenCode serve API. Currently, the system:

1. **Receives** permission requests via SSE events (`permission.asked`)
2. **Displays** Discord buttons (Approve/Deny) with auto-timeout (60 seconds)
3. **Submits** approvals via `POST /session/{id}/permissions/{permissionId}`
4. **Has NO support** for:
   - Batch approval or pre-approval
   - "Always allow" mode
   - Deny/reject endpoint
   - Pattern-based or directory-based filtering

---

## Part 1: API Implementation — EXACT Code

### 1.1 OpenCodeClient.approvePermission() — Complete Implementation

**File:** `src/opencode-client.js` (lines 85-98)

```javascript
/**
 * Aprova uma permissão pendente em uma sessão.
 * @param {string} apiSessionId - ID da sessão na API
 * @param {string} permissionId - ID da permissão a aprovar
 * @returns {Promise<void>}
 */
async approvePermission(apiSessionId, permissionId) {
  const path = `/session/${apiSessionId}/permissions/${permissionId}`;
  const response = await this._fetch(path, { method: 'POST', body: '{}' });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`POST ${path} falhou: ${response.status} ${body}`);
  }
}
```

**Key Details:**
- **Endpoint:** `POST /session/{apiSessionId}/permissions/{permissionId}`
- **Request Body:** Empty JSON object `{}`
- **Response:** No content (empty 200 response expected)
- **Error Handling:** Throws on any non-2xx status
- **No Parameters:** Does NOT accept body parameters for "always" mode, patterns, or directories
- **Single Approval:** Approves one permission at a time (no batch)

### 1.2 OpenCodeClient._fetch() — HTTP Configuration

**File:** `src/opencode-client.js` (lines 130-144)

```javascript
/**
 * Método interno para executar requisições HTTP com configuração padrão.
 * Usa `AbortSignal.timeout` de 10 s a menos que `options.signal` já esteja definido.
 * @param {string} path - Caminho da rota (sem o baseUrl)
 * @param {RequestInit} [options={}] - Opções para o `fetch()`
 * @returns {Promise<Response>}
 */
async _fetch(path, options = {}) {
  const method = options.method ?? 'GET';
  debug('OpenCodeClient', `Requisição: ${method} ${path}`);

  const signal = options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  return fetch(`${this.baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal,
  });
}
```

**Key Details:**
- **Default Timeout:** 10 seconds (`DEFAULT_TIMEOUT_MS` from config)
- **Content-Type:** Always `application/json`
- **No Auth:** No Bearer token or Authorization header added (server trusts local connections)

---

## Part 2: SSE Event Structure & Handling

### 2.1 Permission Request Event — SSE Stream

**Event Type:** `permission.asked`

**Emitted by:** OpenCode serve API

**Caught in:** `src/session-manager.js` lines 336-370

```javascript
case 'permission.asked': {
  // Tenta extrair o ID da permissão de múltiplos caminhos possíveis
  const permissionId =
    props.id ??
    props.permissionId ??
    props.permission?.id ??
    event.data?.id;

  // Extrai metadados úteis para exibir no Discord
  const toolName =
    props.toolName ??
    props.tool?.name ??
    props.permission?.toolName ??
    props.title ??
    'ferramenta desconhecida';

  const description =
    props.description ??
    props.permission?.description ??
    props.title ??
    null;

  debug('OpenCodeSession', '🔐 Permissão solicitada — id=%s tool=%s props=%O', 
    permissionId, toolName, props);

  if (!permissionId) {
    console.error('[OpenCodeSession] ⚠️  Evento permission.asked sem ID. Evento completo:', 
      JSON.stringify(event, null, 2));
    this.emit('permission', { 
      status: 'unknown', 
      toolName, 
      description, 
      error: 'ID não encontrado no evento' 
    });
    break;
  }

  // Armazena ID da permissão e notifica o Discord para exibir botões interativos
  this._pendingPermissionId = permissionId;
  this.emit('permission', { 
    status: 'requested', 
    permissionId, 
    toolName, 
    description 
  });
  break;
}
```

**Inferred Event Structure (from code):**

```javascript
{
  type: 'permission.asked',
  data: {
    type: 'permission.asked',
    properties: {
      // Primary extraction paths (in order of preference):
      id?: string,                 // Checked first
      permissionId?: string,       // Fallback
      
      permission?: {
        id?: string,              // Nested object
        toolName?: string,
        description?: string
      },
      
      // Tool/capability info:
      toolName?: string,           // Direct tool name
      tool?: { name?: string },    // Nested tool
      title?: string,              // Generic label
      
      // Description:
      description?: string,        // Direct description
      
      // Additional fields (potentially):
      // - pattern?: string (file patterns?)
      // - directory?: string (directory constraints?)
    }
  }
}
```

**Key Insights:**
- **Multiple fallback paths:** Code defensively checks 4 different paths for `permissionId`
- **Malformed events:** Some SSE events may arrive without proper structure → fallback to `console.error` with full JSON dump
- **No pattern/directory info:** Current code extracts only `toolName` and `description`, NOT pattern or directory constraints
- **Status field:** Emitted as `'requested'` (not `'approving'` or `'approved'`)

### 2.2 Debug Output — Props Structure Logging

**File:** `src/session-manager.js` line 358

```javascript
debug('OpenCodeSession', '🔐 Permissão solicitada — id=%s tool=%s props=%O', 
  permissionId, toolName, props);
```

The `props=%O` format means the full object is logged via `console.debug`. Run with `DEBUG=*` to see:
- Exact structure of incoming event data
- All fields present in the `permission.asked` event
- Any `pattern` or `directory` fields (if they exist)

---

## Part 3: User-Facing Permission Handling

### 3.1 Discord Button Interface — StreamHandler

**File:** `src/stream-handler.js` lines 454-544

```javascript
/**
 * Gerencia eventos de permissão: exibe botões Aprovar/Recusar ou aviso inline.
 * Para `status === 'requested'`, envia mensagem com botões e inicia timer de 60s.
 * Para `status === 'unknown'`, envia aviso simples sem botões.
 * @param {{ status: string, permissionId?: string, toolName?: string, description?: string, error?: string }} event
 */
async _handlePermissionEvent({ status, permissionId, toolName, description, error }) {
  if (status === 'requested') {
    // Cancela permissão pendente anterior se existir (pode ocorrer em rajadas)
    this._clearPendingPermission();

    const toolLabel = toolName ?? 'ferramenta';
    const descLine = description ? `\n> ${description}` : '';
    const content =
      `🔐 **Permissão solicitada** para \`${toolLabel}\`${descLine}\n\n` +
      `Aprove ou recuse em até **60 segundos**. Sem resposta, será aprovada automaticamente.`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_permission_${this.session.sessionId}`)
        .setLabel('Aprovar')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`deny_permission_${this.session.sessionId}`)
        .setLabel('Recusar')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    );

    let permMsg;
    try {
      permMsg = await this.thread.send({ content, components: [row] });
    } catch (sendErr) {
      console.error('[StreamHandler] Erro ao enviar mensagem de permissão:', sendErr.message);
      return;
    }

    // Auto-aprova após PERMISSION_TIMEOUT_MS se o usuário não interagir
    const timeout = setTimeout(async () => {
      if (!this._pendingPermission) return; // Usuário já interagiu

      const pending = this._pe
