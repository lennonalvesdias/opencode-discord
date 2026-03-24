# Plannotator HTTP API Reverse Engineering — Final Report

**Date:** 2026-03-24  
**Source:** `C:\Users\lenno\.cache\opencode\node_modules\@plannotator\opencode\dist\index.js` (8810 lines, compiled Bun plugin)  
**Version:** @plannotator/opencode v0.14.5

---

## Executive Summary

Plannotator is a **Bun-based HTTP server plugin** that opens interactive review UIs in the browser for plan/annotation approval workflows. The `submit_plan` tool blocks execution using a Promise-based wait mechanism that resolves when the user clicks approve/reject in the browser UI via HTTP endpoints.

---

## Architecture Overview

### Server Type
- **Runtime:** Bun (not Node.js)
- **Port:** Dynamic allocation or configured via `PLANNOTATOR_PORT` environment variable
- **Servers:** Three independent Bun HTTP servers can run simultaneously:
  1. **Plannotator Server** — Main plan review UI
  2. **Review Editor Server** — PR/code review UI
  3. **Annotate Server** — Markdown annotation UI

### Port Allocation Logic

```javascript
// Lines 26-47: Remote detection and port assignment

const DEFAULT_REMOTE_PORT = 19432;

function isRemoteSession() {
  const remote = process.env.PLANNOTATOR_REMOTE;
  if (remote === "1" || remote?.toLowerCase() === "true") return true;
  if (process.env.SSH_TTY || process.env.SSH_CONNECTION) return true;
  return false;
}

function getServerPort() {
  const envPort = process.env.PLANNOTATOR_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
    console.error(`[Plannotator] Warning: Invalid PLANNOTATOR_PORT "${envPort}", using default`);
  }
  return isRemoteSession() ? DEFAULT_REMOTE_PORT : 0;
}
```

**Logic:**
- If `PLANNOTATOR_PORT` env var is set → use it (must be 1-65535)
- Else if remote session (SSH or `PLANNOTATOR_REMOTE=true`) → use port 19432
- Else → use port 0 (OS auto-assigns)

### Port Retry Mechanism

```javascript
// Lines 1168-1169 (and repeated for each server type)

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 500;

// In server creation loop (lines 1192-1413):
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    server = Bun.serve({ port: configuredPort, fetch: ... });
    break;  // Success
  } catch (err) {
    if (err.message.includes("EADDRINUSE") && attempt < MAX_RETRIES) {
      await Bun.sleep(RETRY_DELAY_MS);  // 500ms delay
      continue;  // Retry
    }
    throw err;
  }
}
```

**Behavior:** If port is in use, retry up to 5 times with 500ms delays. If still fails, throw error with hint.

---

## Wait/Resolve Promise Mechanism

### Promise Creation

```javascript
// Lines 1187-1190 (Plannotator server example)

let resolveDecision;
const decisionPromise = new Promise((resolve4) => {
  resolveDecision = resolve4;
});
```

This pattern repeats for:
- Plannotator review server (lines 1187-1190)
- Review editor server (lines 2473-2475)
- Annotate server (lines 2701-2703)

### Promise Resolution

When user clicks **Approve** or **Reject**, the HTTP handler resolves the decision:

```javascript
// Lines 1312-1370: POST /api/approve endpoint

if (url.pathname === "/api/approve" && req.method === "POST") {
  const body = await req.json();
  
  // Extract user input
  const feedback = body.feedback || "";
  const agentSwitch = body.agentSwitch;
  const permissionMode = body.permissionMode;
  const planSave = body.planSave;
  
  // Handle integration saves (Obsidian, Bear, Octarine)
  let savedPath;
  if (planSave?.enabled) {
    saveAnnotations(slug, feedback, planSave.customPath);
    savedPath = saveFinalSnapshot(slug, "approved", plan, feedback, planSave.customPath);
  }
  
  // Resolve the waiting Promise
  resolveDecision({ 
    approved: true, 
    feedback, 
    savedPath, 
    agentSwitch, 
    permissionMode: effectivePermissionMode 
  });
  
  return Response.json({ ok: true, savedPath });
}
```

```javascript
// Lines 1372-1391: POST /api/deny endpoint

if (url.pathname === "/api/deny" && req.method === "POST") {
  const body = await req.json();
  const feedback = body.feedback || "Plan rejected by user";
  
  let savedPath;
  if (body.planSave?.enabled) {
    saveAnnotations(slug, feedback, body.planSave.customPath);
    savedPath = saveFinalSnapshot(slug, "denied", plan, feedback, body.planSave.customPath);
  }
  
  deleteDraft(draftKey);
  
  // Resolve with rejection
  resolveDecision({ 
    approved: false, 
    feedback, 
    savedPath 
  });
  
  return Response.json({ ok: true, savedPath });
}
```

### Server Return Value

```javascript
// Lines 1421-1427: Server object returned to caller

return {
  port: server.port,
  url: serverUrl,
  isRemote,
  waitForDecision: () => decisionPromise,  // <-- Caller awaits this
  stop: () => server.stop()
};
```

---

## HTTP API Endpoints

### Approval/Rejection

#### POST `/api/approve`
**Request Body:**
```json
{
  "feedback": "Your notes here (optional)",
  "agentSwitch": "disabled" | "build" | "review" | (custom agent name),
  "permissionMode": "enforce" | "warn" | "ignore",
  "planSave": {
    "enabled": true,
    "customPath": "/custom/save/path (optional)"
  },
  "obsidian": { ... },
  "bear": { ... },
  "octarine": { ... }
}
```

**Response:**
```json
{
  "ok": true,
  "savedPath": "/path/to/saved/snapshot"
}
```

**Resolves to:**
```javascript
{
  approved: true,
  feedback: string,
  savedPath: string | undefined,
  agentSwitch: string | undefined,
  permissionMode: string | undefined
}
```

#### POST `/api/deny`
**Request Body:**
```json
{
  "feedback": "Custom rejection reason (optional)",
  "planSave": {
    "enabled": true,
    "customPath": "/custom/save/path (optional)"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "savedPath": "/path/to/saved/snapshot"
}
```

**Resolves to:**
```javascript
{
  approved: false,
  feedback: string,
  savedPath: string | undefined
}
```

### Other Data Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/plan` | GET | Get current plan and metadata |
| `/api/plan/version` | GET | Fetch specific version (query: `v=N`) |
| `/api/plan/versions` | GET | List all versions |
| `/api/plan/history` | GET | List all project plans |
| `/api/diff` | GET/POST | Diff operations |
| `/api/pr-context` | GET | Pull request context |
| `/api/pr-action` | POST | Submit PR review |
| `/api/feedback` | POST | Submit feedback without approval |
| `/api/editor-annotations` | GET/POST/DELETE | Manage editor annotations |
| `/api/file-content` | GET | Get file content |
| `/api/git-add` | POST | Stage files in git |
| `/api/upload` | POST | Upload files |
| `/api/image` | POST | Handle image uploads |
| `/api/doc` | GET/POST | Document operations |
| `/api/draft` | POST/DELETE | Draft management |
| `/api/reference/obsidian/files` | GET | Obsidian vault browser |
| `/favicon.svg` | GET | Favicon |

---

## Environment Variables

### Configuration Variables

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `PLANNOTATOR_PORT` | integer (1-65535) | 0 or 19432 | HTTP server port (0 = auto-assign) |
| `PLANNOTATOR_REMOTE` | "0"\|"1"\|"true"\|"false" | (none) | Enable remote server mode |
| `PLANNOTATOR_BROWSER` | string | (use BROWSER env) | Browser command to launch |
| `PLANNOTATOR_SHARE` | "disabled" or any other | (enabled) | Enable/disable plan sharing |
| `PLANNOTATOR_SHARE_URL` | string | "https://share.plannotator.ai" | Base URL for remote share links |
| `PLANNOTATOR_PLAN_TIMEOUT_SECONDS` | integer ≥ 0 | 345600 (4 days) | Timeout for plan review (0 = infinite) |
| `PLANNOTATOR_ALLOW_SUBAGENTS` | "0"\|"1"\|"true"\|"false" | "0" | Allow agent delegation |
| `SSH_TTY` / `SSH_CONNECTION` | (any) | (none) | Detected for remote session |

### Constants

```javascript
DEFAULT_PLAN_TIMEOUT_SECONDS = 345600  // 4 days in seconds (line 8484)
DEFAULT_REMOTE_PORT = 19432            // Remote server default port (line 26)
MAX_RETRIES = 5                         // Port allocation retry attempts (line 1168)
RETRY_DELAY_MS = 500                    // Delay betwe
