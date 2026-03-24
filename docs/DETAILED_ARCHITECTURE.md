# RemoteFlow — Detailed Architecture & Process Flow Guide

This document provides deep-dive details on specific architectural patterns and critical flows.

---

## Part 1: Session Lifecycle in Detail

### State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Session States                                   │
└─────────────────────────────────────────────────────────────────────────┘

[IDLE]
  ├─ Session created, awaiting first message
  │
  ├─ User sends message
  ├─ Transition to RUNNING
  └─ emit('status', 'running')
     └─ StreamHandler sends ⚙️ Processando...
  
[RUNNING]
  ├─ Agente is executing
  ├─ Output being streamed
  │
  ├─ Agent completes but waiting for input
  ├─ Transition to WAITING_INPUT
  └─ emit('status', 'waiting_input')
     └─ StreamHandler sends 💬 Aguardando sua resposta
  
[WAITING_INPUT]
  ├─ Heuristic detected: line ends with ? or (y/n) pattern
  ├─ User can respond via inline message or button
  │
  ├─ User sends message
  ├─ Transition to RUNNING
  └─ [loop back to RUNNING]
  
[FINISHED]
  ├─ Agent completed successfully (idle transition no new input)
  ├─ No pending message queue
  ├─ emit('status', 'finished')
  └─ StreamHandler sends ✅ Sessão concluída

[ERROR]
  ├─ Exception in session or OpenCode crash
  ├─ emit('status', 'error')
  ├─ emit('error', Error)
  └─ StreamHandler sends ❌ Erro na execução
```

### Queue Draining Mechanism

```javascript
// When user sends message inline in thread:
session.queueMessage(text)
  ├─ If status === 'running'
  │    ├─ Push to _messageQueue
  │    ├─ Return { queued: true, position: queue.length }
  │    └─ [await drain call]
  │
  └─ If status === 'idle' or 'waiting_input'
     ├─ Push to _messageQueue
     ├─ Call _drainMessageQueue()
     │    ├─ Loop while _messageQueue.length > 0
     │    │   AND status !== 'running'
     │    │   AND not terminal
     │    │
     │    ├─ Shift first message
     │    ├─ Call sendMessage(text)
     │    ├─ Wait 300ms (prevent spam)
     │    └─ [continue loop]
     │
     └─ Return { queued: false, position: 0 }

// When session becomes idle after running:
session.handleSSEEvent('session.idle')
  └─ _handleIdleTransition()
     ├─ If was running:
     │    ├─ Check if isWaitingForInput(_recentOutput)
     │    ├─ Transition to 'waiting_input' or 'idle'/'finished'
     │    └─ _drainMessageQueue() [auto-drain when idle]
     │
     └─ If was waiting_input:
        ├─ Transition to 'idle'/'finished'
        └─ _drainMessageQueue()
```

### Input Detection Heuristics

```javascript
const INPUT_PATTERNS = [
  /\?\s*$/m,             // "What next?"
  /\(y\/n\)/i,           // (y/n)
  /\(s\/n\)/i,           // (sim/não) — Portuguese
  /\(yes\/no\)/i,        // (yes/no)
  /\(sim\/não\)/i,       // Full Portuguese
  /escolha:/i,           // "escolha:" (choose)
  /selecione:/i,         // "selecione:" (select)
  /confirma(?!r)/i,      // "confirma" but not "confirmar"
  /digite:/i,            // "digite:" (type)
  /informe:/i,           // "informe:" (inform)
  /press\s+enter/i,      // "press enter"
  /pressione\s+enter/i,  // "pressione enter" (Portuguese)
  /^\s*>\s*$/m,          // Lone ">" prompt
  /^\s*\d+[).]\s+\S/m,   // Numbered options: "1) opt" or "1. opt"
];

function isWaitingForInput(text) {
  if (!text) return false;
  const tail = text.slice(-500); // Last 500 chars
  return INPUT_PATTERNS.some(p => p.test(tail));
}
```

---

## Part 2: Message Streaming Deep Dive

### Buffer Architecture

```
Session Output Stream:
  ├─ Raw stdout from opencode process
  │
  ├─ SSE Parser transforms to structured events
  │
  ├─ Session.handleSSEEvent() receives 'message.part.delta'
  │    ├─ Strip ANSI codes: stripAnsi(delta)
  │    └─ Accumulate in:
  │        ├─ outputBuffer (complete history, max 512KB)
  │        ├─ pendingOutput (flushed when sent to Discord)
  │        └─ _recentOutput (last 1000 chars, for input detection)
  │
  ├─ Emit 'output' event
  │
  └─ StreamHandler accumulates in currentContent
     ├─ scheduleUpdate() (debounced by 1500ms)
     │
     └─ After timer: flush()
        ├─ Wait for complete line (don't break mid-table)
        ├─ Convert Markdown tables → code blocks
        ├─ Split into chunks ≤ 1900 chars
        └─ Send/edit Discord messages
```

### Table Conversion Algorithm

```
Input Markdown:
| Name     | Age | City      |
|----------|-----|-----------|
| Alice    | 30  | São Paulo |
| Bob      | 25  | Rio       |

Detection:
  ├─ Line 1: starts with | && ends with | → isTableRow()
  ├─ Line 2: |---|---| pattern → isSeparatorRow()
  ├─ Collect data rows until non-table line
  ├─ Check if table is complete (has content after or is last chunk)
  │
  └─ If incomplete:
     └─ Store in _pendingTableLines (for next flush)

If complete:
  ├─ Parse cells from each row
  ├─ Strip inline Markdown (**bold**, *italic*, `code`)
  ├─ Calculate max width per column
  ├─ Format with Unicode box-drawing chars:
     
Output:
  ```
  Name     Age  City
  ─────────────────────────
  Alice     30  São Paulo
  Bob       25  Rio
  ```

Benefit:
  ├─ Discord doesn't render GFM tables
  └─ Monospace code blocks preserve alignment
```

### Chunking Strategy

```javascript
function splitIntoChunks(text, limit) {
  // limit = 1900 (Discord max 2000)
  
  ├─ If text.length ≤ 1900 → return [text]
  │
  ├─ Else:
  │    ├─ Find last '\n' before position 1900
  │    ├─ If found:
  │    │    └─ Split there (preserve line boundaries)
  │    │
  │    └─ Else:
  │         └─ Split at exactly 1900 (fallback)
  │
  └─ Recursively chunk remaining text
  
Example:
  Input: "Line 1\nLine 2\nVery long line..." (2500 chars)
    ├─ Chunk 1: "Line 1\nLine 2\n..." (1900 chars, ending at '\n')
    └─ Chunk 2: "..." (600 chars)
```

### Message Lifecycle

```
Chunk created (say, 800 chars)
  │
  ├─ Does currentMessage exist?
  │    └─ Is session running or waiting_input?
  │         └─ currentMessageLength + 800 < 1900?
  │              ├─ YES: Edit currentMessage (append)
  │              │   └─ Merges: currentRawContent + "\n" + chunk
  │              │
  │              └─ NO: Create new message
  │                  ├─ Save old message to sentMessages[]
  │                  ├─ thread.send(chunk)
  │                  └─ currentMessage = new message
  │
  └─ If session finished:
     └─ (handled by sendStatusMessage, separate flow)
```

### Status Message Sequence

```
User types /build
  ↓
Session created (status = 'idle')
  ↓
User sends /command or initial prompt
  ↓
session.sendMessage()
  ├─ status = 'running'
  └─ emit('status', 'running')
     └─ StreamHandler queues "⚙️ Processando..."
        ├─ Only sent if !hasOutput (avoid duplicate)
        └─ Sets hasOutput = false after status 'running'
  
[output chunks stream in]
  ├─ StreamHandler accumulates
  ├─ hasOutput set to true
  └─ Messages start appearing
  
[when chunks stop]
  ├─ emit('status', 'idle' or 'waiting_input')
  │    └─ StreamHandler queues corresponding status message
  │
  └─ Flushed via _drainStatusQueue()
     ├─ Sequential processing (no race conditions)
     ├─ Timeout per item: 5000ms
     └─ Continue even if one item fails
```

---

## Part 3: OpenCode API Reference

### HTTP Endpoints Used

```
POST /session
  Request:  { model?: "anthropic/claude-..." }
  Response: { id: "uuid" }
  
GET /session/{id}
  Response: { id, status, ... }

POST /session/{id}/prompt_async
  Request:  { agent: "primary", parts: [{ type: "text", text: "..." }] }
  Response: {} (async, events via SSE)

POST /session/{id}/abort
  Response: {}

DELETE /session/{id}
  Response: {}

POST /session/{id}/permissions/{permissionId}
  Response: {} (approves permission)

GET /event
  Headers: Accept: text/event-stream
  Response: Server-Sent Events stream
```

### SSE Event Types

```
message.part.delta
  ├─ data.properties.field: "text" | "reasoning"
  ├─ data.properties.delta: "chunk of output..."
  └─ [Processed if field === 'text']

message.updated
  └─ [Ignored in new flow]

session.status
  ├─ data.properties.status.type: "idle" | "runni
