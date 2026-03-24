# RemoteFlow — Complete Codebase Overview

## Executive Summary

**RemoteFlow** is a Discord bot that bridges local `opencode` CLI processes (running on Windows) to Discord threads, enabling remote interaction with AI-powered development agents (`plan` and `build`) via iPhone or any device with Discord installed.

**Key Architecture:**
- Bot runs locally on Windows (Node.js + discord.js)
- No cloud services or external tunneling required — uses Discord WebSocket (outbound only)
- Spawns `opencode serve` processes per project, communicates via HTTP + SSE
- Each Discord thread isolates one session, supporting multiple concurrent sessions
- Real-time output streaming to Discord with automatic chunking and rate-limit handling

---

## Project Directory Structure

```
remote-flow/
├── .env                           # Local configuration (not committed)
├── .env.example                   # Configuration template
├── AGENTS.md                      # Coding guidelines for contributors
├── CONTRIBUTING.md                # Contribution guidelines
├── FLOW.md                        # User guide and workflow documentation
├── GITHUB.md                      # GitHub integration guide (PRs, issues, reviews)
├── INSTALL.md                     # Installation and setup guide
├── LICENSE                        # MIT License
├── README.md                      # Main project README
├── CHANGELOG.md                   # Version history
├── package.json                   # Node.js dependencies & scripts
├── package-lock.json              # Locked dependency versions
├── docker-compose.yml             # (For opencode infrastructure — Redis, Postgres, etc.)
├── Dockerfile                     # Docker container configuration
├── vitest.config.js               # Test framework configuration (Vitest)
│
├── src/                           # Main source code
│   ├── index.js                   # Entry point — Discord bot initialization
│   ├── commands.js                # Slash commands handler (1500+ lines)
│   ├── session-manager.js         # Session lifecycle management (669 lines)
│   ├── stream-handler.js          # Output streaming to Discord (752 lines)
│   ├── opencode-client.js         # HTTP client for opencode API
│   ├── opencode-commands.js       # List custom opencode commands from filesystem
│   ├── server-manager.js          # Manages opencode serve processes
│   ├── sse-parser.js              # Server-Sent Events stream parser
│   ├── config.js                  # Centralized env var configuration
│   ├── utils.js                   # Shared utilities (formatAge, stripAnsi, debug)
│   ├── persistence.js             # Session data persistence (optional)
│   ├── audit.js                   # Audit logging for compliance
│   ├── health.js                  # Health check endpoint
│   ├── model-loader.js            # Load available AI models
│   ├── rate-limiter.js            # Rate limiting for commands
│   ├── reporter.js                # Report analysis and generation
│   ├── git.js                     # Git operations (commit, push, branch)
│   └── github.js                  # GitHub API wrapper (Octokit)
│
├── tests/                         # Test suite (Vitest)
│   ├── commands.test.js
│   ├── session-manager.test.js
│   ├── stream-handler.test.js
│   ├── opencode-client.test.js
│   └── opencode-commands.test.js
│
├── specs/                         # Specifications
│   └── 0001/
│       └── SPEC.md                # Full feature specification with requirement IDs
│
└── scripts/                       # Utility scripts
    ├── install-service.ps1        # Windows service installer (NSSM)
    └── kill-port.ps1              # Kill process on specific port

```

---

## Configuration (`.env`)

All configuration is done via environment variables loaded from `.env` file.

### Required Variables

```env
# Discord bot credentials
DISCORD_TOKEN=xoxb_xxxxxxxxxxxxx               # Bot token from Discord Developer Portal
DISCORD_GUILD_ID=123456789012345678            # Server ID where bot operates

# Projects directory
PROJECTS_BASE_PATH=C:\Users\YourUser\projects  # Base path for projects
```

### Optional Variables

```env
# OpenCode binary configuration
OPENCODE_BIN=opencode                 # Path or name of opencode executable
OPENCODE_BASE_PORT=4100               # Base port for opencode serve processes

# Message limits
DISCORD_MSG_LIMIT=1900                # Limit per Discord message (max 2000)
STREAM_UPDATE_INTERVAL=1500           # Flush interval for output streaming (ms)

# Access control
ALLOWED_USER_IDS=userid1,userid2      # Comma-separated Discord user IDs (empty = all)
ALLOW_SHARED_SESSIONS=false           # Allow other users to interact with shared sessions

# Session management
MAX_SESSIONS_PER_USER=3               # Max concurrent sessions per user
MAX_SESSIONS_PER_PROJECT=2            # Max concurrent sessions per project
MAX_GLOBAL_SESSIONS=0                 # Global session limit (0 = unlimited)
SESSION_TIMEOUT_MS=1800000            # Inactivity timeout (30 min default)

# Health check
HEALTH_PORT=9090                      # Port for health check endpoint

# Persistence
PERSISTENCE_PATH=~/.remote-flow/data.json     # Session data persistence file
AUDIT_LOG_PATH=~/.remote-flow/audit.ndjson    # Audit log file

# AI models
AVAILABLE_MODELS=anthropic/claude-sonnet-4-5,openai/gpt-4o  # Available models for selection
DEFAULT_MODEL=anthropic/claude-sonnet-4-5     # Default model for sessions

# GitHub integration
GITHUB_TOKEN=ghp_xxxxx                        # GitHub Personal Access Token
GITHUB_DEFAULT_OWNER=myorg                    # Fallback repo owner
GITHUB_DEFAULT_REPO=myrepo                    # Fallback repo name
GIT_AUTHOR_NAME=RemoteFlow Bot                # Author for auto-commits
GIT_AUTHOR_EMAIL=bot@remote-flow.local        # Author email

# Development
DEBUG=false                           # Enable detailed debug logging (or NODE_ENV=development)
ENABLE_DM_NOTIFICATIONS=false         # Send DM when session completes
```

### Default Configuration Reference

See `.env.example` for full list with descriptions.

---

## Core Components

### 1. Entry Point (`src/index.js`)

**Responsibilities:**
- Initialize Discord client with required intents
- Register slash commands
- Wire up event handlers (interactions, messages)
- Implement graceful shutdown
- Notify users about interrupted sessions on restart

**Key Flows:**
- `client.once('clientReady')` → Load persisted sessions, register commands, start health server
- `client.on('interactionCreate')` → Autocomplete, slash commands, button interactions
- `client.on('messageCreate')` → Inline messages in threads → forward to opencode stdin
- Process signals (`SIGINT`, `SIGTERM`) → graceful shutdown with session cleanup

**Features:**
- Detects restart scenarios and notifies users in Discord threads
- Atomic operation guards (rate limiting, permission checks)
- Error handling with proper ephemeral error messages

---

### 2. Session Manager (`src/session-manager.js`)

**Class: `OpenCodeSession` — Represents one active opencode session**

Properties:
```javascript
sessionId          // UUID internal identifier
projectPath        // Absolute path to project
threadId           // Discord thread ID
userId             // Discord user ID
agent              // 'plan' or 'build'
model              // AI model identifier (or empty for default)
status             // 'idle', 'running', 'waiting_input', 'finished', 'error'
apiSessionId       // ID returned by opencode API
outputBuffer       // Complete accumulated output
pendingOutput      // Output not yet sent to Discord
_messageQueue      // Messages awaiting send (when session running)
_recentOutput      // Last ~2000 chars (for input detection)
passthroughEnabled // Whether inline messages auto-forward to agent
```

**Methods:**
- `async start(serverManager)` — Initialize session, register with API
- `async sendMessage(text)` — Send message to agent
- `async abort()` — Abort current execution
- `async queueMessage(text)` — Queue message if running, send if idle
- `async close()`
