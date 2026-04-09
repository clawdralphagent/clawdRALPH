# clawdRALPH Implementation Plan

A comprehensive 8-phase plan to build the unified clawdRALPH platform, combining Clawdbot's multi-channel infrastructure with Ralph's autonomous development loop.

---

## Phase 1: Foundation & Core Infrastructure ✅ COMPLETED

**Goal**: Establish the project structure, build system, and core runtime infrastructure.

### 1.1 Project Scaffolding
- [x] Initialize TypeScript 5.7 project with ESM modules
- [x] Configure npm workspace structure
- [x] Set up tsconfig.json with strict mode and path aliases
- [x] Create directory structure following the architecture spec
- [x] Initialize git-ready project with .gitignore

### 1.2 Build System
- [x] Configure tsc for TypeScript compilation
- [x] Set up tsx for development with watch mode
- [x] Create build scripts for production bundles
- [x] Configure source maps for debugging
- [x] Set up post-build script for assets

### 1.3 CLI Framework
- [x] Implement CLI entry point (`src/entry.ts`)
- [x] Set up Commander.js program builder
- [x] Create argument parsing utilities
- [x] Implement help system and version command
- [x] Add global options (--config, --verbose, --quiet)

### 1.4 Configuration System
- [x] Define Zod schemas for all configuration
- [x] Implement JSON5 config file parsing
- [x] Create config validation and defaults
- [x] Add environment variable support
- [x] Implement config file creation utility

### 1.5 Logging & Error Handling
- [x] Create structured logging system
- [x] Implement log levels and filtering
- [x] Add file output transport
- [x] Create error boundary utilities
- [x] Implement graceful shutdown handling

### 1.6 Testing Infrastructure
- [x] Configure Vitest for unit and integration tests
- [x] Set up coverage thresholds (50% minimum)
- [x] Create test utilities and fixtures
- [x] Add mock factories for common dependencies
- [x] Configure test runner with 156 passing tests

**Deliverables**:
- ✅ Working CLI that responds to `clawdralph --help`
- ✅ Configuration loading from `~/.clawdralph/config.json`
- ✅ Logging to stdout and file
- ✅ 55%+ test coverage on foundation code

---

## Phase 2: WebSocket Gateway & Session Management ✅ COMPLETED

**Goal**: Build the central gateway server that orchestrates all communication.

### 2.1 WebSocket Server
- [x] Implement Hono-based HTTP + ws WebSocket server
- [x] Create connection lifecycle management
- [x] Add heartbeat/ping-pong for connection health
- [x] Implement message serialization (JSON)
- [x] Create extended WebSocket with metadata

### 2.2 Session System
- [x] Design session state schema with Zod
- [x] Implement session creation and destruction
- [x] Add session persistence to disk (JSON files)
- [x] Create session restoration on restart
- [x] Implement conversation history tracking

### 2.3 Event System
- [x] Create typed event definitions (GatewayEventType)
- [x] Implement EventBus for internal routing
- [x] Add event persistence for replay
- [x] Create event filtering and subscriptions
- [x] Implement wildcard subscriptions

### 2.4 Authentication & Authorization
- [x] Implement gateway authentication (token-based with SHA-256 hashing)
- [x] Create client identity management
- [x] Add role-based access control (admin, user, channel, node, viewer)
- [x] Implement rate limiting per client
- [x] Create authorization for actions

### 2.5 Gateway CLI Commands
- [x] Implement `clawdralph gateway` command (starts server)
- [x] Add `clawdralph gateway status` command
- [x] Create `clawdralph sessions list` command
- [x] Implement `clawdralph sessions delete <id>` command
- [x] Add `clawdralph gateway token` for token generation

### 2.6 Gateway Protocol
- [x] Define Zod schemas for all message types
- [x] Implement request/response correlation
- [x] Add protocol versioning (1.0.0)
- [x] Generate TypeScript types from schemas
- [x] Create error code constants

**Deliverables**:
- ✅ Gateway server running on configurable port (default 18789)
- ✅ Session management with disk persistence
- ✅ Event-based communication between components
- ✅ Token-based authentication and role-based access control

---

## Phase 3: Messaging Channel Integration ✅ COMPLETED (Telegram, Discord, Signal)

**Goal**: Implement connections to major messaging platforms.

### 3.1 Channel Abstraction Layer
- [x] Define `Channel` interface with standard methods
- [x] Create message normalization types (ChannelMessage, OutgoingMessage)
- [x] Implement attachment handling abstraction
- [x] Create channel capability detection (ChannelCapabilities)
- [x] Define channel status types (ChannelStatus, ChannelState)

### 3.2 Telegram Integration
- [x] Integrate grammY SDK
- [x] Implement message receiving and sending
- [x] Handle media messages (photos, documents, voice, video, stickers)
- [x] Implement group chat support with mention gating
- [x] Add reply support

### 3.3 Discord Integration
- [x] Integrate discord.js
- [x] Implement bot token authentication
- [x] Handle server/channel permissions via allowlist
- [x] Implement DM and server message handling
- [x] Add reply support

### 3.4 Signal Integration
- [x] Implement signal-cli JSON-RPC wrapper
- [x] Handle direct and group messages
- [x] Add device linking support
- [x] Implement message send/receive via JSON-RPC

### 3.5 Channel Manager
- [x] Create ChannelManager for orchestration
- [x] Implement multi-channel message routing
- [x] Connect channels to gateway event bus
- [x] Add broadcast capability

### 3.6 Channel Routing
- [x] Create allowlist/blocklist filtering
- [x] Add group vs DM routing rules
- [x] Implement requireMention option for groups

### 3.7 Channel CLI Commands
- [x] Implement `clawdralph channels list`
- [x] Add `clawdralph channels connect <channel>`
- [x] Create `clawdralph channels disconnect <channel>`
- [x] Implement `clawdralph channels test <channel>`
- [x] Add `clawdralph channels setup` wizard for each channel
- [x] Add `clawdralph channels status`

### 3.8 Future Channels (deferred)
- [ ] WhatsApp (Baileys integration)
- [ ] Slack (@slack/bolt integration)
- [ ] iMessage (macOS AppleScript)
- [ ] Microsoft Teams
- [ ] Matrix protocol

**Deliverables**:
- ✅ 3 working messaging channels (Telegram, Discord, Signal)
- ✅ Unified message handling via Channel interface
- ✅ Channel routing with allowlists/blocklists
- ✅ Interactive setup wizard for credentials
- ✅ CLI commands for channel management

---

## Phase 4: AI Provider Integration & Agent Runtime ✅ COMPLETED

**Goal**: Implement multi-model AI support and the agent execution runtime.

### 4.1 Model Provider Abstraction
- [x] Define `AIProvider` interface with standard methods
- [x] Create model capability detection (ProviderCapabilities)
- [x] Implement streaming response handling (AsyncIterable<StreamChunk>)
- [x] Add token counting utilities (countTokens method)
- [x] Create configuration schemas with Zod validation

### 4.2 Anthropic Provider
- [x] Integrate official @anthropic-ai/sdk
- [x] Implement Claude messaging API (complete & stream)
- [x] Handle tool use (function calling)
- [x] Add message format conversion (toAnthropicMessages)
- [x] Support system prompts and tool results

### 4.3 OpenAI Provider
- [x] Integrate openai SDK
- [x] Implement chat completions API (complete & stream)
- [x] Add function calling support
- [x] Handle streaming responses with tool call accumulation
- [x] Support GPT-4o, GPT-4, and o1 models

### 4.4 Ollama Provider
- [x] Implement Ollama REST API integration
- [x] Add local model support (llama3.2 default)
- [x] Create model listing and pulling
- [x] Implement NDJSON streaming
- [x] Support tool calling for compatible models

### 4.5 Agent Runtime
- [x] Implement Agent class with conversation management
- [x] Create tool execution framework with ToolRegistry
- [x] Add conversation history handling
- [x] Implement streaming chat with tool iteration
- [x] Create provider switching and status checking

### 4.6 Tool System
- [x] Define ToolDefinition and ToolHandler interfaces
- [x] Implement ToolRegistry for registration and discovery
- [x] Create tool execution with context
- [x] Add tool enable/disable capability
- [x] Implement default tools (web_search, calculator, remember, recall, get_current_time)

### 4.7 Reasoning Levels
- [x] Define ReasoningLevel enum (off, minimal, low, medium, high, xhigh)
- [x] Create getReasoningBudget() function for token budgets
- [x] Add reasoning configuration in AIConfigSchema

### 4.8 Agent CLI Commands
- [x] Implement `clawdralph agent chat` interactive mode
- [x] Add `clawdralph agent complete <prompt>` one-shot mode
- [x] Create `clawdralph agent providers` status command
- [x] Implement `clawdralph agent tools` listing
- [x] Add `clawdralph agent models` per-provider listing

**Deliverables**:
- ✅ Working AI providers (Anthropic, OpenAI, Ollama)
- ✅ Agent runtime with tool execution and conversation management
- ✅ Configurable reasoning levels
- ✅ Interactive and one-shot CLI modes
- ✅ 156 tests passing

---

## Phase 5: Ralph Loop Engine ✅ COMPLETED

**Goal**: Implement the autonomous development loop with PRD support.

### 5.1 PRD Parser
- [x] Define PRD JSON schema with Zod
- [x] Implement markdown PRD parsing
- [x] Create PRD validation and normalization
- [x] Add user story extraction
- [x] Implement acceptance criteria parsing

### 5.2 PRD Generation
- [x] Create interactive PRD wizard
- [x] Implement question-answer flow
- [x] Add PRD template system
- [x] Create markdown PRD output
- [x] Implement PRD from conversation context

### 5.3 Story Management
- [x] Implement story selection algorithm
- [x] Create dependency ordering logic
- [x] Add priority-based scheduling
- [x] Implement story sizing validation
- [x] Create story status tracking

### 5.4 Loop Orchestration
- [x] Implement core iteration loop
- [x] Create fresh context spawning
- [x] Add iteration timeout handling
- [x] Implement completion detection
- [x] Create loop pause/resume capability

### 5.5 Quality Gates
- [x] Implement test runner integration
- [x] Add TypeScript type checking gate
- [x] Create linting gate
- [x] Implement browser verification gate (placeholder)
- [x] Add custom gate plugin support

### 5.6 Progress Tracking
- [x] Implement progress.txt append-only log
- [x] Create prd.json status updates
- [x] Add iteration history tracking
- [x] Implement learnings extraction
- [x] Create AGENTS.md file management

### 5.7 Git Integration
- [x] Implement automatic commit creation
- [x] Create branch management (feature branches)
- [x] Add commit message generation
- [x] Implement automatic archiving
- [x] Create PR preparation

### 5.8 Loop CLI Commands
- [x] Implement `clawdralph loop start`
- [x] Add `clawdralph loop status`
- [x] Create `clawdralph loop stop`
- [x] Implement `clawdralph loop pause/resume`
- [x] Add `clawdralph prd create/convert`

### 5.9 Channel Integration
- [x] Connect loop events to messaging channels
- [x] Implement progress streaming to channels
- [x] Add story completion notifications
- [x] Create error alerts to channels
- [x] Implement loop control via messages

**Deliverables**:
- ✅ Working autonomous loop engine
- ✅ PRD creation and parsing
- ✅ Quality gates (tests, typecheck, custom gates)
- ✅ Progress tracking and git integration
- ✅ Loop control from CLI

---

## Phase 6: Browser Automation & Verification ✅ COMPLETED

**Goal**: Implement browser control for web interactions and UI verification.

### 6.1 Browser Manager
- [x] Implement Chrome/Chromium lifecycle management
- [x] Create browser profile management
- [x] Add headless/headed mode support
- [x] Implement multiple browser instances
- [x] Create browser resource cleanup

### 6.2 CDP Integration
- [x] Integrate Chrome DevTools Protocol
- [x] Implement page navigation
- [x] Add DOM inspection and manipulation
- [x] Create screenshot capabilities
- [x] Implement network interception

### 6.3 Page Interaction Tools
- [x] Implement element clicking
- [x] Add form filling capabilities
- [x] Create keyboard input simulation
- [x] Implement file upload handling
- [x] Add scroll support

### 6.4 UI Verification
- [x] Implement visual regression detection
- [x] Create element presence assertions
- [x] Add layout verification
- [x] Implement accessibility checks
- [x] Create visual diff reporting

### 6.5 Browser Tool for Agent
- [x] Create browser tool definitions (11 tools)
- [x] Implement action serialization
- [x] Add snapshot generation
- [x] Create page interaction tools
- [x] Implement session persistence

### 6.6 Dev Server Integration
- [x] Implement dev server auto-detection (vite, next, remix, astro, etc.)
- [x] Create URL routing for local apps
- [x] Add ready state detection
- [x] Implement port management
- [x] Create dev server lifecycle management

### 6.7 Browser CLI Commands
- [x] Implement `clawdralph browser open <url>`
- [x] Add `clawdralph browser screenshot`
- [x] Create `clawdralph browser verify`
- [x] Implement `clawdralph browser profiles`
- [x] Add `clawdralph browser devserver`
- [x] Add `clawdralph browser status`

**Deliverables**:
- ✅ Browser automation via Playwright/CDP
- ✅ UI verification with element assertions
- ✅ Screenshot and visual comparison capabilities
- ✅ 11 browser tools available to agent
- ✅ Dev server auto-detection and management
- ✅ CLI commands for browser control

---

## Phase 7: Memory System & Skill Ecosystem ✅ COMPLETED

**Goal**: Implement vector memory for semantic search and extensible skill system.

### 7.1 Vector Database
- [x] Integrate sqlite-vec via better-sqlite3
- [x] Create embedding storage schema (documents, embeddings, fts tables)
- [x] Implement vector indexing with distance metrics
- [x] Add similarity search queries (cosine distance)
- [x] Create index maintenance utilities (vacuum, stats)

### 7.2 Embedding Providers
- [x] Implement OpenAI embeddings (text-embedding-3-small/large)
- [x] Create local embedding option (Ollama with nomic-embed-text)
- [x] Implement embedding caching (LRU cache with TTL)
- [x] Add batch embedding support
- [x] Create local hash-based provider for testing

### 7.3 Semantic Search
- [x] Implement hybrid search (FTS5 + vector search)
- [x] Create relevance scoring with configurable weights
- [x] Add search filtering (by type, session, threshold)
- [x] Implement context retrieval for conversations
- [x] Create search result formatting with re-ranking

### 7.4 Memory Indexing
- [x] Implement conversation indexing
- [x] Add code file indexing (TypeScript, Python, Rust, Go, etc.)
- [x] Create document indexing (markdown with headers)
- [x] Implement incremental updates (batch indexer)
- [x] Add file watcher for automatic re-indexing

### 7.5 Skill Definition
- [x] Define Skill interface and BaseSkill abstract class
- [x] Create skill manifest schema with Zod
- [x] Implement skill discovery from directories
- [x] Add skill dependency resolution
- [x] Create skill sandboxing (path/command restrictions)
- [x] Implement skill rate limiting

### 7.6 Core Skills
- [x] Implement file system skill (10 tools: read, write, list, mkdir, delete, copy, move, exists, stat, search)
- [x] Add Git skill (12 tools: status, diff, log, add, commit, branch, checkout, pull, push, stash, reset, show)
- [x] Create shell execution skill (5 tools: exec, script, stream, env, which)
- [x] Implement HTTP skill (8 tools: get, post, put, patch, delete, head, request, download)

### 7.7 Integration Skills
- [x] Implement GitHub skill (repos, issues, PRs, commits, code search)
- [ ] Add Notion skill (deferred - requires OAuth setup)
- [ ] Create Obsidian skill (deferred)
- [ ] Implement calendar skill (deferred)
- [ ] Add email skill (deferred)

### 7.8 Memory & Skill CLI Commands
- [x] Implement `clawdralph memory status`
- [x] Add `clawdralph memory search <query>`
- [x] Create `clawdralph memory index <path>`
- [x] Implement `clawdralph memory clear`
- [x] Add `clawdralph memory store`
- [x] Implement `clawdralph memory export`
- [x] Implement `clawdralph skills list`
- [x] Add `clawdralph skills enable/disable`
- [x] Create `clawdralph skills tools`
- [x] Implement `clawdralph skills run <tool>`
- [x] Add `clawdralph skills info <skillId>`
- [x] Implement `clawdralph skills discover <path>`

**Deliverables**:
- ✅ Vector database with sqlite-vec + FTS5 hybrid search
- ✅ Memory indexing for conversations, code, and markdown
- ✅ 35+ skill tools across 5 core skills
- ✅ Skill registry with enable/disable management
- ✅ Memory and skills CLI commands
- ✅ 377+ tests passing

---

## Phase 8: Native Apps, Web UI & Production Hardening ✅ COMPLETED (Core Features)

**Goal**: Build native apps, web dashboard, and prepare for production deployment.

### 8.1 Web Dashboard ✅
- [x] Create React-based web UI with Vite + TailwindCSS
- [x] Implement real-time status display via WebSocket
- [x] Add loop progress visualization with progress ring
- [x] Create session management interface
- [x] Implement configuration editor UI

### 8.2 Flowchart Visualization (Partial)
- [x] Add loop progress visualization
- [x] Create interactive story highlighting
- [x] Implement progress display
- [ ] Port full Ralph flowchart (deferred)
- [ ] Add story detail panels (deferred)

### 8.3 macOS App (Deferred)
- [ ] Create SwiftUI menu bar application
- [ ] Implement gateway connection
- [ ] Add Voice Wake overlay
- [ ] Create Talk Mode interface
- [ ] Implement system notifications

### 8.4 iOS App (Deferred)
- [ ] Create SwiftUI iOS companion
- [ ] Implement canvas display
- [ ] Add voice input support
- [ ] Create Bonjour pairing
- [ ] Implement push notifications

### 8.5 Android App (Deferred)
- [ ] Create Kotlin Compose application
- [ ] Implement gateway connection
- [ ] Add voice input support
- [ ] Create notification handling
- [ ] Implement background service

### 8.6 Docker Support ✅
- [x] Create optimized multi-stage Dockerfile
- [x] Implement docker-compose configuration
- [x] Add sandbox container definitions
- [x] Create volume management
- [x] Implement health checks

### 8.7 Production Hardening ✅
- [x] Add monitoring and metrics (MetricsRegistry)
- [x] Implement health check system
- [x] Add alert management
- [x] Create resource usage tracking
- [ ] Security audit (ongoing)

### 8.8 Documentation (Partial)
- [x] Update README with new features
- [ ] Create comprehensive API documentation (deferred)
- [ ] Add installation guides per platform (deferred)
- [ ] Create troubleshooting guides (deferred)

### 8.9 CI/CD Pipeline ✅
- [x] Configure GitHub Actions workflows (CI)
- [x] Implement automated testing
- [x] Add release automation
- [x] Create npm publishing workflow
- [x] Add Dependabot configuration

### 8.10 Launch Preparation (Deferred)
- [ ] Create marketing website
- [ ] Set up documentation hosting
- [ ] Implement usage analytics (opt-in)
- [ ] Create onboarding wizard
- [ ] Prepare launch announcements

**Deliverables**:
- ✅ Web dashboard with real-time monitoring
- ⏳ Native apps for macOS, iOS, Android (deferred)
- ✅ Docker deployment support
- ⏳ Comprehensive documentation (partial)
- ✅ CI/CD pipeline for releases

---

## Phase Summary

| Phase | Focus | Key Deliverables | Status |
|-------|-------|------------------|--------|
| 1 | Foundation | CLI, Config, Logging, Tests | ✅ Complete |
| 2 | Gateway | WebSocket Server, Sessions, Events | ✅ Complete |
| 3 | Channels | Telegram, Discord, Signal, Routing | ✅ Complete |
| 4 | AI | Multi-Model Support, Agent Runtime | ✅ Complete |
| 5 | Ralph Loop | Autonomous Development, PRDs, Quality Gates | ✅ Complete |
| 6 | Browser | Automation, UI Verification | ✅ Complete |
| 7 | Memory & Skills | Vector Search, 35+ Skill Tools | ✅ Complete |
| 8 | Apps & Production | Web UI, Docker, CI/CD, Monitoring | ✅ Complete (Core) |

## Success Criteria

The project is complete when:

1. **Multi-Channel Communication**: Users can send development requests from any of 5+ messaging platforms
2. **Autonomous Loop**: The Ralph loop can autonomously implement features from PRD to PR
3. **Quality Assurance**: All code passes tests, type checks, and browser verification before commit
4. **Progress Visibility**: Real-time progress streaming to user's preferred channel
5. **Memory Persistence**: Learnings and patterns preserved across iterations
6. **Native Experience**: Working apps on macOS, iOS, and Android
7. **Production Ready**: Docker deployment, comprehensive docs, CI/CD pipeline

## Resource Estimates

| Phase | Complexity | Dependencies |
|-------|------------|--------------|
| 1 | Medium | None |
| 2 | High | Phase 1 |
| 3 | High | Phase 2 |
| 4 | High | Phase 2 |
| 5 | Very High | Phases 2, 4 |
| 6 | High | Phase 4 |
| 7 | High | Phases 2, 4 |
| 8 | Very High | All previous |

## Risk Mitigation

1. **API Changes**: Abstract all third-party integrations behind interfaces
2. **Rate Limits**: Implement proper backoff and queueing for all APIs
3. **Context Limits**: Design for chunking and context window management from day one
4. **Security**: Security review at each phase, especially for shell execution
5. **Compatibility**: Test across Node versions and operating systems continuously

---

*This plan is designed to be executed iteratively. Each phase builds upon the previous, and the system becomes usable incrementally. Phase 1-4 delivers a basic working system; Phase 5 adds the autonomous loop; Phases 6-8 polish and extend the platform.*

---

## Handoff Section for Fresh Context

This section provides all the context needed for a new Claude Code instance to continue development.

### Project Overview

**clawdRALPH** is an autonomous multi-channel AI development agent that combines:
- **Clawdbot**: Multi-channel messaging infrastructure (Telegram, Discord, Signal, etc.)
- **Ralph**: Autonomous coding loop pattern (fresh context per iteration, PRD-driven, quality gates)

**GitHub**: https://github.com/lalomorales22/clawdRALPH

### Current State (January 2026)

**Phases 1-7 are COMPLETE** with 377+ tests passing. The project has:
- ✅ Full CLI framework with Commander.js
- ✅ WebSocket gateway with session management
- ✅ 3 messaging channels (Telegram, Discord, Signal)
- ✅ AI provider abstraction (Anthropic, OpenAI, Ollama)
- ✅ Agent runtime with tool execution
- ✅ Ralph loop engine with PRD support
- ✅ Quality gates (tests, typecheck, custom)
- ✅ Progress tracking with learnings extraction
- ✅ Git integration for auto-commits
- ✅ Browser automation via Playwright/CDP
- ✅ UI verification with element assertions
- ✅ 11 browser tools for agent integration
- ✅ Dev server auto-detection and management
- ✅ Vector database with sqlite-vec + FTS5 hybrid search
- ✅ Embedding providers (OpenAI, Ollama, local)
- ✅ Memory indexing (conversations, code, markdown)
- ✅ 5 core skills with 35+ tools (filesystem, git, shell, http, github)
- ✅ Skill registry with sandboxing and rate limiting
- ✅ Memory and skills CLI commands

**Next phase to implement: Phase 8 (Native Apps, Web UI & Production Hardening)**

### Key Files & Directories

```
src/
├── ai/                    # AI PROVIDERS & AGENT (Phase 4) ✅
│   ├── types.ts           # AIProvider interface, Message, ToolCall, Zod schemas
│   ├── anthropic.ts       # Claude via @anthropic-ai/sdk
│   ├── openai.ts          # GPT via openai SDK
│   ├── ollama.ts          # Local models via REST API
│   ├── tools.ts           # ToolRegistry, default tools (calculator, remember, etc.)
│   ├── agent.ts           # Agent class with conversation management
│   └── index.ts           # Exports

├── memory/                # MEMORY SYSTEM (Phase 7) ✅
│   ├── types.ts           # MemoryStore, EmbeddingProvider, SearchQuery schemas
│   ├── database.ts        # SQLiteMemoryStore with sqlite-vec + FTS5
│   ├── embeddings.ts      # OpenAI, Ollama, Local embedding providers + caching
│   ├── search.ts          # SemanticSearch, TextChunker, SearchReranker, QueryExpander
│   ├── indexer.ts         # DefaultMemoryIndexer, BatchIndexer, FileWatcher
│   └── index.ts           # MemorySystem facade, createMemoryTools()

├── skills/                # SKILL ECOSYSTEM (Phase 7) ✅
│   ├── types.ts           # Skill, SkillManifest, BaseSkill, SkillContext schemas
│   ├── registry.ts        # DefaultSkillRegistry, SkillDiscovery, SkillSandbox, RateLimiter
│   ├── core/
│   │   ├── filesystem.ts  # FilesystemSkill (10 tools)
│   │   ├── git.ts         # GitSkill (12 tools)
│   │   ├── shell.ts       # ShellSkill (5 tools)
│   │   ├── http.ts        # HttpSkill (8 tools)
│   │   └── index.ts       # Core skill exports
│   ├── integrations/
│   │   ├── github.ts      # GitHubSkill (repos, issues, PRs, commits)
│   │   └── index.ts       # Integration skill exports
│   └── index.ts           # SkillsSystem facade, createSkillTools()

├── ralph/                 # RALPH LOOP ENGINE (Phase 5) ✅
│   ├── types.ts           # PRD, UserStory, LoopState Zod schemas
│   ├── prd.ts             # PRD parsing, validation, markdown conversion
│   ├── stories.ts         # Story selection, dependency resolution
│   ├── progress.ts        # Progress tracking, AGENTS.md management
│   ├── quality.ts         # Quality gates (tests, typecheck, custom)
│   ├── git.ts             # Git integration, auto-commit
│   ├── loop.ts            # LoopEngine class, orchestration
│   └── index.ts           # Exports

├── browser/               # BROWSER AUTOMATION (Phase 6) ✅
│   ├── types.ts           # Zod schemas for browser config, actions, verification
│   ├── manager.ts         # BrowserManager for Playwright lifecycle
│   ├── cdp.ts             # Chrome DevTools Protocol integration
│   ├── page.ts            # PageController for high-level interactions
│   ├── verify.ts          # UIVerifier, ElementAssertion for UI testing
│   ├── tools.ts           # 11 browser tools for agent (navigate, click, type, etc.)
│   ├── devserver.ts       # Dev server detection and management
│   └── index.ts           # Exports

├── gateway/               # WEBSOCKET GATEWAY (Phase 2) ✅
│   ├── server.ts          # GatewayServer class, Hono + ws
│   ├── session.ts         # SessionStore, disk persistence to ~/.clawdralph/sessions/
│   ├── events.ts          # EventBus with typed events
│   ├── auth.ts            # TokenAuth, role-based access (admin/user/channel/node/viewer)
│   ├── protocol.ts        # Protocol helpers
│   └── types.ts           # GatewayMessage schemas, SessionState, etc.

├── channels/              # MESSAGING CHANNELS (Phase 3) ✅
│   ├── types.ts           # Channel interface, ChannelMessage, OutgoingMessage
│   ├── telegram.ts        # TelegramChannel using grammY
│   ├── discord.ts         # DiscordChannel using discord.js
│   ├── signal.ts          # SignalChannel wrapping signal-cli JSON-RPC
│   ├── manager.ts         # ChannelManager orchestrating all channels
│   └── index.ts           # Exports

├── cli/                   # CLI COMMANDS ✅
│   ├── program.ts         # buildProgram() with Commander.js
│   ├── shutdown.ts        # Graceful shutdown
│   └── commands/
│       ├── gateway.ts     # clawdralph gateway [start|status|token]
│       ├── sessions.ts    # clawdralph sessions [list|delete]
│       ├── channels.ts    # clawdralph channels [list|setup|connect|disconnect|test|status]
│       ├── agent.ts       # clawdralph agent [chat|complete|providers|models|tools]
│       ├── browser.ts     # clawdralph browser [open|screenshot|verify|profiles|devserver|status]
│       ├── config.ts      # clawdralph config [show|edit|reset]
│       ├── loop.ts        # clawdralph loop [start|status|stop|pause|resume]
│       ├── prd.ts         # clawdralph prd [create|convert|show|validate|list|export]
│       ├── status.ts      # clawdralph status
│       └── version.ts     # clawdralph version

├── config/                # CONFIGURATION (Phase 1) ✅
│   ├── loader.ts          # loadConfig() with JSON5 parsing
│   ├── defaults.ts        # Default config values
│   └── watcher.ts         # Config file watcher

├── logging/               # LOGGING (Phase 1) ✅
│   ├── logger.ts          # createLogger(), structured logging
│   ├── formatters.ts      # Log formatters
│   └── transports.ts      # Console and file transports

├── types/                 # SHARED TYPES ✅
│   ├── config.ts          # AppConfigSchema with Zod
│   └── common.ts          # CLIContext, etc.

└── utils/                 # UTILITIES ✅
    ├── result.ts          # Result<T,E> pattern
    ├── paths.ts           # getConfigPath(), getDataDir()
    ├── env.ts             # loadEnv()
    └── async.ts           # sleep(), retry(), timeout()
```

### Key Patterns & Conventions

1. **ESM Modules**: All imports use `.js` extension (e.g., `import { X } from './types.js'`)
2. **Zod Schemas**: All external data validated with Zod schemas
3. **Result Pattern**: Use `Result<T, E>` from `src/utils/result.ts` for fallible operations
4. **Logging**: Use `createLogger('module-name')` for structured logs
5. **CLI Commands**: Each command exports a function returning a `Command` instance

### Running the Project

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build
npm run build

# Run tests (377 tests, all passing)
npm test

# Type check
npm run typecheck

# Run CLI
npm run start -- --help
# or after build:
node dist/entry.js --help
```

### Dependencies (package.json)

Key dependencies already installed:
- `@anthropic-ai/sdk` - Anthropic Claude API
- `openai` - OpenAI GPT API
- `grammy` - Telegram Bot API
- `discord.js` - Discord Bot API
- `hono` - HTTP framework
- `ws` - WebSocket
- `commander` - CLI framework
- `zod` - Schema validation
- `chalk`, `ora` - Terminal UI
- `json5` - Config parsing
- `vitest` - Testing

### Configuration

Config stored at `~/.clawdralph/config.json` (JSON5 format). Key sections:

```typescript
// From src/types/config.ts
AppConfigSchema = {
  gateway: { port, bind, auth },
  logging: { level, file, json },
  telegram: { token, allowlist, allowDirectMessages, allowGroupMessages, requireMention },
  discord: { token, clientId, allowlist, ... },
  signal: { accountId, signalCliPath, ... },
  anthropic: { apiKey, defaultModel, maxRetries },
  openai: { apiKey, defaultModel, ... },
  ollama: { baseUrl, defaultModel },
  // ... more
}
```

### What Was Built in Phase 6 (Completed)

**Phase 6: Browser Automation & Verification** - Browser control for web interactions and UI verification.

The `src/browser/` directory was created with:

1. **Browser Manager** (`src/browser/manager.ts`) ✅
   - Playwright-based browser lifecycle management
   - Chrome/Firefox/WebKit support
   - Headless/headed mode support
   - Multiple browser instance management
   - Browser profile management
   - CDP connection support

2. **CDP Integration** (`src/browser/cdp.ts`) ✅
   - Chrome DevTools Protocol direct access
   - DOM snapshot capture
   - Accessibility tree retrieval
   - Network interception
   - Performance metrics
   - Cookie/storage management

3. **Page Interactions** (`src/browser/page.ts`) ✅
   - PageController class for high-level interactions
   - Navigation (goto, back, forward, reload)
   - Element interaction (click, type, fill, select, check)
   - Keyboard/mouse input simulation
   - File upload support
   - Multiple selector strategies (CSS, XPath, text, role, testId)
   - Screenshot capture

4. **UI Verification** (`src/browser/verify.ts`) ✅
   - ElementAssertion with fluent API
   - UIVerifier class for comprehensive testing
   - Element visibility/enabled/checked assertions
   - Text and attribute assertions
   - Visual regression with baseline comparison
   - Accessibility checks (alt text, form labels, lang attribute)
   - Layout verification (element dimensions)

5. **Browser Tools for Agent** (`src/browser/tools.ts`) ✅
   - 11 browser tools: browser_launch, browser_navigate, browser_click, browser_type, browser_screenshot, browser_get_content, browser_wait, browser_evaluate, browser_verify, browser_close, browser_snapshot
   - Session state management
   - Tool context integration

6. **Dev Server Integration** (`src/browser/devserver.ts`) ✅
   - Auto-detection of dev server types (vite, next, remix, astro, webpack, etc.)
   - Package manager detection (npm, yarn, pnpm, bun)
   - Ready state detection with customizable patterns
   - Port management and availability checking
   - Lifecycle management (start, stop, restart)

7. **CLI Commands** (`src/cli/commands/browser.ts`) ✅
   - `clawdralph browser open <url>` - Open URL in browser
   - `clawdralph browser screenshot <url>` - Capture screenshot
   - `clawdralph browser verify <url>` - Run UI verification
   - `clawdralph browser profiles` - Manage browser profiles
   - `clawdralph browser devserver` - Dev server management
   - `clawdralph browser status` - Browser manager status

### What Needs to be Built Next (Phase 8)

**Phase 8: Native Apps, Web UI & Production Hardening** - Build native apps, web dashboard, and prepare for production deployment.

Create native applications and web dashboard with:

1. **Web Dashboard**
   - React-based web UI
   - Real-time status display
   - Loop progress visualization
   - Session management interface
   - Configuration editor

2. **Flowchart Visualization**
   - Ralph flowchart visualization
   - Real-time loop state visualization
   - Interactive step highlighting
   - Progress animation

3. **Native Apps**
   - macOS SwiftUI menu bar app
   - iOS SwiftUI companion app
   - Android Kotlin Compose app

4. **Docker Support**
   - Optimized Dockerfile
   - docker-compose configuration
   - Sandbox container definitions
   - Health checks

5. **Production Hardening**
   - Comprehensive error handling
   - Monitoring and metrics
   - Backup and restore utilities
   - Security audit and fixes

6. **Documentation**
   - API documentation
   - Installation guides
   - Troubleshooting guides
   - Interactive tutorials

7. **CI/CD Pipeline**
   - GitHub Actions workflows
   - Automated testing
   - Release automation
   - npm publishing workflow

### Integration Points

The loop should integrate with:
- **Agent** (`src/ai/agent.ts`): Use `createAgent()` with fresh context per iteration
- **Tools** (`src/ai/tools.ts`): Register code editing, file reading, git tools
- **Gateway Events** (`src/gateway/events.ts`): Emit loop progress events
- **Channel Manager** (`src/channels/manager.ts`): Broadcast to connected channels

### Example PRD Format (to implement)

```json
{
  "id": "feature-auth",
  "title": "User Authentication System",
  "description": "JWT-based authentication...",
  "stories": [
    {
      "id": "story-1",
      "title": "Create User model",
      "description": "...",
      "acceptanceCriteria": ["...", "..."],
      "priority": 1,
      "dependencies": [],
      "status": "pending",
      "size": "small"
    }
  ],
  "metadata": {
    "createdAt": "2026-01-27T...",
    "workspace": "/path/to/project"
  }
}
```

### Testing Strategy

- Add tests in `src/ralph/*.test.ts`
- Test PRD parsing with fixtures
- Test story selection algorithm
- Mock git operations for testing
- Integration tests for full loop (may need longer timeout)

### Environment Variables

The user has API keys for:
- `ANTHROPIC_API_KEY` - Claude API
- `OPENAI_API_KEY` - OpenAI API (optional)
- `TELEGRAM_BOT_TOKEN` - Telegram bot
- `DISCORD_BOT_TOKEN` - Discord bot
- Signal uses local signal-cli installation

### Notes for Implementation

1. **Fresh Context**: Each loop iteration should create a NEW Agent instance. Don't carry conversation history between iterations.

2. **Progress File**: The `progress.txt` is append-only. Format each entry like:
   ```
   === Iteration 3 [2026-01-27 10:30:00] ===
   Story: story-1 "Create User model"
   Status: COMPLETED
   Learnings:
   - Used Prisma for ORM
   - Added password hashing with bcrypt
   ```

3. **AGENTS.md**: This file captures patterns/conventions discovered during development. The agent should read it at the start of each iteration and update it when discovering new patterns.

4. **Quality Gates**: Must ALL pass before committing. If tests fail, the agent should attempt to fix them (within iteration limit).

5. **Safety**: The loop should have max iterations (default: 10) to prevent infinite loops.

### Quick Start for New Instance

1. Read this handoff section
2. Review all completed phases in `src/` to understand the codebase
3. Read `src/ai/agent.ts` to understand the agent runtime
4. Read `src/gateway/events.ts` to understand event system
5. Read `src/memory/` and `src/skills/` for Phase 7 implementations
6. Start Phase 8 with web dashboard or native apps
7. Add tests as you go
8. Run `npm run typecheck` and `npm test` frequently

Good luck!
