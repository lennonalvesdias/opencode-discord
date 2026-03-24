# OpenCode Permissions & Configuration Research

**Research Date:** 2026-03-24  
**Researcher:** RemoteFlow Investigation  
**Status:** Complete

---

## 1. OpenCode Configuration Files

### Primary Config Location
**Path:** `C:\Users\lenno\.config\opencode\opencode.jsonc`

This is the main configuration file for OpenCode CLI. The configuration uses a hierarchical permission system for controlling agent access to tools and operations.

### Config Structure
- **Schema:** OpenCode Config Schema (https://opencode.ai/config.json)
- **Format:** JSONC (JSON with Comments)
- **Size:** ~257 lines
- **Key Sections:** 
  - Model configuration (providers, tier selection)
  - Agent-specific permissions
  - Global permissions
  - MCP (Model Context Protocol) server configuration
  - Plugins

### Related Config Files
- `C:\Users\lenno\.config\opencode\dcp.jsonc` — Dynamic Context Pruning configuration
- `C:\Users\lenno\.config\opencode\command\*.md` — Custom agent commands and documentation
- `C:\Users\lenno\.config\opencode\agent\*.md` — Agent-specific prompts and instructions
- `C:\Users\lenno\.config\opencode\philosophy\AGENTS.md` — Agent philosophy documentation

---

## 2. OpenCode Permission System

### How Permissions Work

OpenCode uses a **declarative, hierarchical permission model** where each agent has explicit allowances and denials for specific capabilities.

#### Permission Schema Structure

```jsonc
"permission": {
  "edit": "allow" | "deny",        // File editing capability
  "write": "allow" | "deny",       // File writing capability
  "read": "allow" | "deny",        // File reading capability
  "bash": {
    "*": "deny" | "allow",         // Wildcard: apply to all bash commands
    "specific_cmd": "allow|deny"   // Per-command rules (pattern matching)
  },
  "task": "allow" | "deny",        // Task execution
  "glob": "allow" | "deny",        // File globbing
  "grep": "allow" | "deny",        // Content searching
  "[prefix]_*": "allow" | "deny"   // Prefix-based tool groups
}
```

#### Global Permission Defaults

Located at `opencode.jsonc` root level:

```jsonc
"permission": {
  "task": "deny",
  "context7_*": "deny",
  "exa_*": "deny",
  "gh_grep_*": "deny",
  "kagi_*": "deny",
  "webfetch": "deny",
  "worktree_*": "deny"
}
```

**Default Behavior:** Everything is implicitly **DENIED** unless explicitly **ALLOWED** in agent or global permissions.

---

## 3. Agent Permission Configuration

### Agents Defined in opencode.jsonc

**Plan Agent** (`plan`)
- **Role:** Deep reasoning, planning, review orchestration
- **Model:** `github-copilot/claude-opus-4.6`
- **Temperature:** 0.3
- **Reasoning Effort:** High
- **Key Permissions:**
  ```jsonc
  "permission": {
    "edit": "deny",
    "write": "deny",
    "bash": { "*": "deny" },
    "task": "allow",
    "worktree_*": "allow"
  }
  ```
- **Intent:** Read-only planning; cannot modify files but can manage work trees for task planning

**Build Agent** (`build`)
- **Role:** Orchestration coordinator
- **Model:** `github-copilot/claude-sonnet-4.6`
- **Key Permissions:**
  ```jsonc
  "permission": {
    "edit": "deny",
    "write": "deny",
    "bash": { "*": "deny" },
    "task": "allow",
    "worktree_*": "allow"
  }
  ```
- **Intent:** Delegates work to coder; cannot execute directly

**Coder Agent** (`coder`)
- **Role:** Implementation specialist
- **Model:** `github-copilot/claude-sonnet-4.6`
- **Key Permissions:**
  ```jsonc
  "permission": {
    "read": "allow",
    "write": "allow",
    "edit": "allow",
    "glob": "allow",
    "grep": "allow",
    "bash": "allow",
    "context7_*": "deny",
    "exa_*": "deny",
    "plan_read": "deny",
    "todoread": "deny"
  }
  ```
- **Intent:** Full file manipulation and bash command execution; cannot access research tools

**Explore Agent** (`explore`)
- **Role:** Fast, lightweight codebase exploration
- **Model:** `github-copilot/claude-haiku-4.5`
- **Key Permissions:**
  ```jsonc
  "bash": {
    "*": "deny",
    "ls *": "allow",
    "tree *": "allow",
    "pwd": "allow",
    "cat *": "allow",
    "head *": "allow",
    "tail *": "allow",
    "wc *": "allow",
    "file *": "allow",
    "stat *": "allow",
    "grep *": "allow",
    "rg *": "allow",
    "find *": "allow",
    "git status*": "allow",
    "git log*": "allow",
    "git diff*": "allow",
    "git show*": "allow",
    "git blame*": "allow",
    "git branch*": "allow",
    "git ls-files*": "allow",
    "uname*": "allow",
    "hostname": "allow",
    "whoami": "allow",
    "which *": "allow",
    "realpath *": "allow"
  }
  ```
- **Intent:** Read-only exploration with safe bash commands only

**Researcher Agent** (`researcher`)
- **Role:** External research and data fetching
- **Model:** `github-copilot/claude-sonnet-4.6`
- **Key Permissions:**
  ```jsonc
  "permission": {
    "context7_*": "allow",
    "exa_*": "allow",
    "gh_grep_*": "allow",
    "vercel_*": "allow",
    "railway_*": "allow",
    "kagi_*": "deny",
    "webfetch": "allow",
    "write": "deny",
    "edit": "deny"
  }
  ```
- **Intent:** Access to research APIs and web fetching; no file modification

**Scribe Agent** (`scribe`)
- **Role:** Documentation and writing
- **Model:** `github-copilot/claude-haiku-4.5`
- **Key Permissions:**
  ```jsonc
  "permission": {
    "bash": { "*": "deny" },
    "edit": "allow",
    "glob": "allow",
    "read": "allow",
    "write": "allow"
  }
  ```
- **Intent:** File-based writing without bash execution

**Reviewer Agent** (`reviewer`)
- **Role:** Code review and analysis
- **Model:** `github-copilot/claude-opus-4.6`
- **Key Permissions:**
  ```jsonc
  "permission": {
    "edit": "deny",
    "write": "deny",
    "bash": {
      "*": "deny",
      "git diff*": "allow",
      "git log*": "allow",
      "git show*": "allow",
      "git blame*": "allow",
      "rg *": "allow"
    },
    "plan_read": "allow",
    "delegation_read": "allow",
    "delegation_list": "allow"
  }
  ```
- **Intent:** Read-only code analysis with git and search tools

---

## 4. Permission Inheritance and Resolution

### Resolution Order (Highest to Lowest Priority)

1. **Agent-specific permissions** (in `agent.{agent_name}.permission`)
2. **Global permissions** (in root `permission` key)
3. **Implicit default:** DENY

### Example Resolution

For agent `coder` and operation `bash` with command `npm install`:

1. Check `agent.coder.permission.bash` → value is `"allow"` (wildcard allows)
2. **Result:** ✅ ALLOWED

For agent `explore` and operation `bash` with command `bash -c "rm -rf /"`:

1. Check `agent.explore.permission.bash` → value is `{ ... }` (object with patterns)
2. Check if pattern matches (e.g., `"rm *"`) → NO match
3. Check wildcard `bash["*"]` → value is `"deny"`
4. **Result:** ❌ DENIED

---

## 5. RemoteFlow Permission Handling

### Where Permissions Are Managed in RemoteFlow

#### 1. **Interactive Permission Requests** (User-facing)

**File:** `src/stream-handler.js`

When OpenCode server requests permission, RemoteFlow displays Discord buttons:

```javascript
// Lines 454-544
async _handlePermissionEvent({ status, permissionId, toolName, description, error }) {
  if (status === 'requested') {
    // Show approval/denial buttons to user
    // Buttons: "Aprovar" (Approve) and "Recusar" (Deny)
    
    // Button IDs for interaction:
    // - approve_permission_{sessionId}
    // - deny_permission_{sessionId}
  }
}
```

**Permission Flow:**

1. OpenCode SSE stream emits `permission.asked` event
2. Event contains:
   - `permissionId` — unique permission request ID
   - `toolName` — tool/capability being requested (e.g., "bash")
   - `description` — human-readable description of the operation
3. RemoteFlow catches event in `session-manager.js` (lines 336-370)
4. Session emits `permission` event to StreamHandler
5. StreamHandler displays message with approval buttons (60-second timeout)

**User Response Options:**

- **Approve Button:** Calls `session.server.client.approvePermission(apiSessionId, permissionId)`
- **Deny Button:** Calls `session.abort()` which terminates the session
- **Auto-Approve on Timeout:** A
