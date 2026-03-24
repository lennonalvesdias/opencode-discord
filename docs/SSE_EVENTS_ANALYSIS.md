# SSE Events Analysis — OpenCode RemoteFlow Bot

## Executive Summary

The built-in `submit_plan` tool in OpenCode emits various SSE (Server-Sent Events) that the RemoteFlow bot handles. Below is the **complete list of all SSE event types** processed, how they flow through the system, and the full button interaction pattern used for interactive approvals.

---

## 1. ALL SSE Event Types Handled

### Current Event Types (in `session-manager.js` handleSSEEvent)

The `OpenCodeSession.handleSSEEvent()` method has a `switch` statement handling these event types:

| Event Type | Handler | Purpose | Data Structure |
|---|---|---|---|
| **`message.part.delta`** | Line 286 | Text output chunk (streaming) | `{ properties: { field: string, delta: string } }` |
| **`session.status`** | Line 315 | Session state changes | `{ properties: { status: { type: string } } }` |
| **`session.idle`** | Line 323 | Explicit idle event (alternative to status) | — |
| **`session.error`** | Line 329 | Session error occurred | `{ properties: { error: string, message: string } }` |
| **`permission.asked`** | Line 336 | Tool requires interactive approval | `{ properties: { id, permissionId, toolName, description, permission: { id, toolName, description } } }` |
| **`session.diff`** | Line 372 | File changes (diffs) | `{ properties: { diffs: [{ path, file, filename, content, patch, diff }] } }` |
| **`question.asked`** | Line 389 | Agent asking user a question | `{ properties: { id, questionId, questions: [{ question: string }] } }` |

### Unhandled Event Types (Logged as warnings)

These SSE types arrive but are intentionally **not processed**:

```
- session.created      - Session lifecycle start
- session.updated      - Session state update
- message.updated      - Message metadata change
- message.part.updated - Partial message update
- file.watcher.updated - File system change
- server.heartbeat     - Keep-alive ping
- server.connected     - Server connection event
```

---

## 2. `permission.asked` Event — Full Flow with Button Interactions

### 2.1 Event Reception (Session Manager)

Location: `src/session-manager.js:336–370`

When OpenCode emits a permission request (e.g., for the `submit_plan` tool):

- Extracts `permissionId` from event (tries multiple paths: `props.id`, `props.permissionId`, `props.permission.id`)
- Extracts `toolName` metadata (for Discord display)
- Stores `this._pendingPermissionId` to track which permission is awaiting approval
- **Emits:** `session.emit('permission', { status: 'requested', permissionId, toolName, description })`

### 2.2 Discord Button Rendering (Stream Handler)

Location: `src/stream-handler.js:454–544`

When permission event arrives with `status: 'requested'`:

**Message Content:**
```
🔐 **Permissão solicitada** para `tool_name`
> Optional description here

Aprove ou recuse em até **60 segundos**. Sem resposta, será aprovada automaticamente.
```

**Buttons:**
- ✅ **Aprovar** (Success green) → customId: `approve_permission_{sessionId}`
- ❌ **Recusar** (Danger red) → customId: `deny_permission_{sessionId}`

**Auto-Approval Timeout:**
- **Duration:** `PERMISSION_TIMEOUT_MS` (default: 60,000 ms)
- **Trigger:** If no button clicked within timeout
- **Action:**
  1. Disable buttons
  2. Update message: "⏰ *Aprovado automaticamente por timeout.*"
  3. Call `session.server.client.approvePermission(apiSessionId, permissionId)`

### 2.3 Button Click Handling (Commands)

Location: `src/commands.js:1627–1683`

#### **Approve Button:**
```
1. Get session by sessionId from customId
2. Call: await session.server.client.approvePermission(session.apiSessionId)
3. Update buttons to disabled with label "Aprovado ✅"
4. Reply silently (no ephemeral message)
```

**API Call:** `POST /session/{apiSessionId}/permissions/{permissionId}` with `{}`

#### **Deny Button:**
```
1. Get session by sessionId from customId
2. Call: await session.abort()
3. Update buttons to disabled with label "Recusado ❌"
4. Update message: "❌ Permissão recusada — sessão encerrada."
```

**Note:** Denying permissions works by **terminating the entire session** via `abort()`. There is **NO explicit deny API endpoint**.

### 2.4 Critical Implementation Detail

**Location in Stream Handler:** `src/stream-handler.js:529–532`

```javascript
await this.session.server.client.approvePermission(
  this.session.apiSessionId, 
  pending.permissionId
);
```

This is how the bot **closes the loop** — sends the approval back to OpenCode.

---

## 3. `question.asked` Event — User Interaction Flow

### 3.1 Event Reception (Session Manager)

Location: `src/session-manager.js:389–408`

When OpenCode agent asks a question:

- Extracts `questionId` and `questions` array
- Sets `this.status = 'waiting_input'`
- **Emits:** `session.emit('question', { questionId, questions })`

### 3.2 Discord Display (Stream Handler)

Location: `src/stream-handler.js:141–150`

```
❓ **O agente tem uma pergunta para você:**
> Question 1
> Question 2
```

**Key Point:** Questions are **NOT interactive buttons** — just informational messages. User responds by typing in the thread.

---

## 4. `session.diff` Event — File Change Preview

### 4.1 Event Reception (Session Manager)

Location: `src/session-manager.js:372–387`

Extracts diff content and file paths, emits: `session.emit('diff', { path, content })`

### 4.2 Discord Rendering (Stream Handler)

Location: `src/stream-handler.js:160–201`

- **Small diffs** (≤1500 chars): Inline code block with syntax highlighting
- **Large diffs** (>1500 chars): Sent as `.diff` file attachment
- **Format:** Unified diff format

---

## 5. Complete Event Handling Chain — Data Flow

```
OpenCode SSE Stream
        ↓
SSE Parser (sse-parser.js)
  - Splits text on "event:" / "data:" lines
  - Converts JSON data payloads
        ↓
OpenCodeServer.connectSSE() (server-manager.js:244)
  - Maintains persistent SSE connection
  - Reconnects with exponential backoff on failure
        ↓
OpenCodeServer._dispatchSSEEvent() (server-manager.js:285)
  - Extracts sessionID from event
  - Routes to registered OpenCodeSession
        ↓
OpenCodeSession.handleSSEEvent() (session-manager.js:281)
  - Switch on event.type
  - Emits domain events: 'permission', 'question', 'diff', 'output', 'status'
        ↓
    ┌───────────────────────────────────────┐
    │  StreamHandler Event Listeners         │
    │  (stream-handler.js:46–151)           │
    └───────────────────────────────────────┘
         ↓                    ↓
    Permission Handler  Question/Diff Handlers
    Render buttons       Display messages
    60s timeout          Format output
```

---

## 6. Status State Machine

State transitions in `OpenCodeSession`:

```
idle
  ↓
running  ← message.part.delta / session.status(type: 'idle')
  ↓
waiting_input ← question.asked OR OUTPUT_PATTERNS detected
  ↓
finished ← session.idle after waiting_input
  ↓
error ← session.error
```

**Smart Detection:** Bot detects `waiting_input` via heuristic patterns when no explicit `question.asked` event arrives:
- Lines ending with `?`
- `(y/n)`, `(s/n)`, `(yes/no)` patterns
- `escolha:`, `selecione:`, `digite:`
- Prompt `>` character
- Numbered options like `1) option`

---

## 7. `submit_plan` Tool Integration

### How It Works Currently

1. User runs `/plan` command
2. Slash command sends initial prompt to OpenCode agent
3. Agent executes logic and possibly encounters `submit_plan` tool
4. If `submit_plan` requires approval:
   - OpenCode emits **`permission.asked`** SSE event
   - RemoteFlow bot receives event → renders buttons in Discord
   - User clicks Approve/Deny within 60s (or auto-approved on timeout)
   - Bot calls OpenCode API to confirm/deny permission
5. Agent continues or halts based on user's choice

### Key Finding

**There is NO separate `plan.submitted` or `plan.review` event type.** The `submit_plan` tool is handled like any other tool requiring permission via the standard `permission.asked` event.

---

## 8. API Endpoints Reference

### OpenCode REST API (opencode-client.js)

| Endpoint | Method | Purpose |
|---|---|---|
| `/session` | POST | Cr
