# Ageaf — OpenAI Provider (Codex CLI) Integration Plan

**Date:** 2026-01-24

## Goal

Add **OpenAI** as a first-class provider in the Ageaf panel, implemented by driving the **official Codex CLI** (not a custom OpenAI API wrapper), while preserving the existing UI/UX patterns used for the **Anthropic** (Claude Code) provider.

## Key Decisions (from requirements)

- **Execution strategy:** OpenAI provider runs **Codex CLI** (CodexMonitor-style) and relies on CLI-managed session handling.
- **Single host:** Both providers are driven via the same local host process (the panel always talks to one host).
- **Provider naming:** User-facing labels are **Anthropic** and **OpenAI** (no “Claude/Codex” labels).
- **Auth UX:** Settings → Authentication has two subsections: Anthropic and OpenAI, each with `KEY=VALUE` env vars.
- **Permissions UX:** Provider-specific “Tool/Command Permissions”:
  - Anthropic: keep existing **Tools toggle** behavior.
  - OpenAI: expose **Approval Policy** selector (`untrusted`, `on-request`, `on-failure`, `never`) mapped to Codex app-server.
- **Skills/MCP viability:** OpenAI adapter must remain compatible with Codex’s tool ecosystem (Codex `mcp-server` / restrictions).

## Architecture Overview

### Extension (thin UI)

- Provider selection per conversation/session: `Anthropic` or `OpenAI`.
- Send chat requests to host: `POST /v1/jobs` with `provider`.
- Stream results via SSE: `GET /v1/jobs/:id/events`.
- When Codex requires approval/user-input, surface it in the panel and respond to host:
  - `POST /v1/jobs/:id/respond` (respond to Codex JSON-RPC request id)
  - `POST /v1/jobs/:id/cancel` (interrupt in-flight turn)

### Host (runtime orchestrator)

- **Anthropic runtime** (existing): Claude Agent SDK + Claude Code CLI.
- **OpenAI runtime** (new): spawn `codex app-server` and speak JSON-RPC over stdio.
  - Initialize once per host (or per workspace scope), then create/reuse threads per conversation.
  - Convert Codex app-server notifications into Ageaf job events (`delta`, `usage`, `done`, `plan`, `error`).
  - When Codex sends JSON-RPC requests (approval/user-input), pause the turn until the extension replies.

## Data Model / Persistence

- Extension continues to persist conversation history per Overleaf project in `chrome.storage.local`.
- For OpenAI conversations, persist the Codex **threadId** in the conversation record so refresh/navigation can resume CLI state.

## Phased Implementation

### Phase 1 — Provider plumbing + auth UI (no approvals)

- Add OpenAI env var box to Settings → Authentication.
- Add OpenAI provider selection to “New chat” menu (enable it).
- Add host-side `codex app-server` runner that can:
  - `initialize` + `initialized`
  - `thread/start` (store thread id)
  - `turn/start` and map `item/agentMessage/delta` → `delta`
  - map `turn/completed` → `done`

### Phase 2 — Real streaming + interruption

- Make `/v1/jobs` async: return `jobId` immediately; stream events over long-lived SSE.
- Add `/v1/jobs/:id/cancel` and wire the panel’s ESC interrupt to call it.

### Phase 3 — Approval Policy + approvals UX

- Add Settings control for OpenAI Approval Policy.
- Implement Codex approval/user-input JSON-RPC request handling:
  - Detect `method.includes("requestApproval")` and `item/tool/requestUserInput` requests.
  - Emit a job event describing the request.
  - Accept `respond` calls that send JSON-RPC responses back to Codex.

### Phase 4 — MCP/skills compatibility hooks

- Decide the host-facing abstraction for “tool providers”:
  - Native Codex tool ecosystem via Codex config / `mcp-server` subprocess.
  - Future: unify with Claude’s tool gating in a shared “tools policy” layer.

## Acceptance Checklist (definition of done)

- [ ] Create new chat and choose **OpenAI**.
- [ ] Host starts Codex sessions via CLI and streams output in-panel.
- [ ] Settings → Authentication includes **Anthropic** and **OpenAI** subsections.
- [ ] OpenAI supports Approval Policy selector and honors it.
- [ ] Approvals/user-input requests can be surfaced and responded to.
- [ ] Architecture remains compatible with MCP/skills for both providers.

