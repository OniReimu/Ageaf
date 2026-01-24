# Ageaf Rebuild (Overleaf Agent Panel) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild “Overleaf Copilot” into **Ageaf**: a Cursor-like in-page right-side chat panel for Overleaf that routes work to a local companion app, starting with a Claude Code/Claude Agent SDK runtime and later adding Codex CLI support.

**Architecture:** MV3 Chrome extension injects an in-page panel UI and captures editor context. It talks to a localhost “Ageaf Host” over HTTP + SSE. The host runs workflows using a Claude runtime (Agent SDK) and returns structured patch proposals that the extension can apply into the Overleaf editor.

**Tech Stack:** TypeScript, MV3 Chrome extension, Preact UI (or React if preferred), Node.js companion daemon (Fastify or Express), SSE streaming, Claude Agent SDK via **Claude Code runtime (interactive terminal login)**. Later: Codex CLI adapter.

---

## Product Decisions (Lock These Early)

1. **Context scope for v1**
   - **Level 0 (recommended v1):** selection + nearby lines + optional compile log snippet; apply patch only to selection/cursor.
   - **Level 2 (later):** full local mirror (Overleaf Git clone) enabling multi-file edits + latexmk verification.

2. **Runtime auth stance (Claude)**
   - **No login UI in the extension or host.** Do not add a login page and do not redirect users to any login page.
   - If the host detects **no API key / no authenticated runtime**, return a clear “not configured” status and the extension should instruct the user to **open their own terminal and log in to Claude Code** (interactive login), then retry.

3. **UI placement**
   - In-page fixed right panel (Cursor-like) with resize/collapse.
   - Do NOT rely on Chrome sidePanel for v1.

---

## Repo Restructure (Minimal, Practical)

Keep extension at repo root; add a local companion in `host/`.

- Create: `host/package.json`
- Create: `host/src/server.ts`
- Create: `host/src/routes/*`
- Create: `host/src/runtimes/claude/*`
- Create: `host/src/workflows/*`
- Create: `host/src/security/*`

Extension additions:
- Create: `src/iso/panel/*` (UI)
- Create: `src/iso/api/*` (localhost client + SSE)
- Create: `src/main/editorBridge/*` (selection/apply patch in MAIN world)

---

## APIs and Schemas (Use Strict Types)

### HTTP API (Ageaf Host)

- `GET /v1/health` → runtime readiness
- `POST /v1/jobs` → starts a job
- `GET /v1/jobs/:id/events` → SSE stream
- `GET /v1/jobs/:id/result` → final structured result

### Request schema (extension → host)

- `provider`: `"claude" | "codex"` (codex later)
- `action`: `"chat" | "rewrite" | "fix_error" | "bib" | ...`
- `overleaf`: `{ projectId, doc, range?, cursor?, url }`
- `context`: `{ selection, surroundingBefore, surroundingAfter, compileLog? }`
- `policy`: `{ requireApproval, allowNetwork, maxFiles }`

### Streaming event schema (host → extension)

- `plan` (high-level intent)
- `delta` (streamed assistant output)
- `tool_call` (what runtime is doing)
- `patch` (structured patch proposal)
- `done` (success/fail)

### Patch schema (host → extension)

Start with safe in-editor operations:
- `replaceSelection`: `{ text }`
- `insertAtCursor`: `{ text }`

Later:
- `unifiedDiff`: `{ diff, files }` (requires mirror strategy)

---

## Security Model (Do Not Skip)

- Host binds to `127.0.0.1` only.
- Pairing: host generates a secret; user pastes into extension options.
- Extension sends `Authorization: Bearer <secret>` on every request.
- Host enforces:
  - strict CORS allowlist (Overleaf origin + extension origin)
  - basic rate limiting
  - per-job logging stored locally

---

## Milestones

### Milestone A (MVP): Chat panel + rewrite selection
- In-page panel UI
- Pairing + `/v1/health`
- Submit “rewrite selection” job to host
- Stream response
- Apply `replaceSelection` patch into Overleaf

### Milestone B: Multi-step workflows (Claude-first)
- Workflow router in host
- “Fix compile error” workflow (log parse → patch)
- Optional verifier step (selection-only) and later (latexmk with mirror)

### Milestone C: Codex CLI adapter (TODO)
- Add provider adapter for `codex exec --json`
- Keep same host API and patch schema

---

# Detailed Task Plan (Claude-first)

### Task 1: Rename project to Ageaf

**Files:**
- Modify: `package.json`
- Modify: `public/manifest.json`
- Modify: `README.md`

**Step 1: Decide naming surface**
- Update extension name, description, and any UI headings.

**Step 2: Manual verification**
- Run: `npm run build`
- Load unpacked: `build/`
- Confirm extension title shows “Ageaf”.

**Step 3: Commit**
- `git add package.json public/manifest.json README.md`
- `git commit -m "chore: rename extension to Ageaf"`

---

### Task 2: Add `host/` companion skeleton

**Files:**
- Create: `host/package.json`
- Create: `host/tsconfig.json`
- Create: `host/src/server.ts`
- Create: `host/src/routes/health.ts`

**Step 1: Write a failing test (node:test)**
- Create: `host/test/health.test.ts`
- Assert `GET /v1/health` returns 200 and JSON.

**Step 2: Run test to verify it fails**
- Run: `cd host && npm test`
- Expected: FAIL (server not implemented).

**Step 3: Minimal implementation**
- Implement Fastify/Express server with `/v1/health`.

**Step 4: Run test to verify it passes**
- Run: `cd host && npm test`
- Expected: PASS.

**Step 5: Commit**
- `git add host`
- `git commit -m "feat(host): add health endpoint"`

---

### Task 3: Local-only host (no pairing)

**Files:**
- Modify: `host/src/routes/jobs.ts`
- Modify: `host/src/server.ts`
- Test: `host/test/pairing.test.ts`

**Steps:**
1. RED: `/v1/pair` is not available (404).
2. RED: `/v1/jobs` without Authorization returns 200 + jobId.
3. GREEN: remove pairing route and auth middleware.
4. Commit: `feat(host): remove pairing auth`.

---

### Task 4: Jobs API + SSE streaming (plumbing)

**Files:**
- Create: `host/src/routes/jobs.ts`
- Create: `host/src/sse.ts`
- Create: `host/src/types.ts`
- Test: `host/test/jobs-sse.test.ts`

**Steps:**
1. RED: POST `/v1/jobs` returns `jobId`.
2. RED: GET `/v1/jobs/:id/events` streams at least `plan` and `done` events.
3. GREEN: implement job registry + SSE stream.
4. Commit: `feat(host): add jobs + sse`.

---

### Task 5: Claude runtime adapter (Claude Agent SDK)

**Files:**
- Create: `host/src/runtimes/claude/client.ts`
- Create: `host/src/runtimes/claude/run.ts`
- Modify: `host/src/routes/jobs.ts`

**Steps:**
1. Decide minimal adapter interface:
   - `runJob(payload, emitEvent)`
2. Implement “echo” first (no network) to validate streaming pipeline.
3. Replace echo with Claude call using the Claude Code runtime.
   - If the runtime is not authenticated / no API key is configured, return a clear “not configured” status and instruct the user to log in via their own terminal (Claude Code interactive login), then retry.
4. Commit: `feat(host): claude runtime adapter`.

---

### Task 6: Define patch output contract + schema validation

**Files:**
- Modify: `host/src/types.ts`
- Create: `host/src/validate.ts`
- Test: `host/test/patch-schema.test.ts`

**Steps:**
1. RED: reject invalid patch payloads.
2. GREEN: validate patches before emitting `patch` event.
3. Commit: `feat(host): validate patch schema`.

---

### Task 7: Extension options page for pairing token + host URL

**Files:**
- Modify: `public/options.html`
- Modify: `src/components/Options.tsx`
- Modify: `src/utils/helper.ts`

**Steps:**
1. Add fields: host URL (default `http://127.0.0.1:3210`) and pairing token.
2. Save to `chrome.storage`.
3. Manual test: open options page and persist settings.
4. Commit: `feat(extension): add host pairing settings`.

---

### Task 8: Cursor-like right-side in-page panel UI (skeleton)

**Files:**
- Create: `src/iso/panel/Panel.tsx`
- Create: `src/iso/panel/panel.css`
- Modify: `src/iso/contentScript.ts`

**Steps:**
1. Inject root container into Overleaf page.
2. Render a fixed right panel with header, scroll area, and input.
3. Add collapse + resize.
4. Manual test on Overleaf: panel mounts reliably.
5. Commit: `feat(ui): add Ageaf in-page panel`.

---

### Task 9: Editor bridge for selection + apply patch (MAIN world)

**Files:**
- Create: `src/main/editorBridge/bridge.ts`
- Modify: `src/main/contentScript.ts`
- Modify: `src/iso/contentScript.ts`

**Steps:**
1. Expose events:
   - request selection context
   - apply `replaceSelection`
   - apply `insertAtCursor`
2. Wire panel UI buttons to request context and apply patch.
3. Manual test: replacing selection works.
4. Commit: `feat(extension): selection + patch bridge`.

---

### Task 10: Localhost client + streaming in the panel

**Files:**
- Create: `src/iso/api/client.ts`
- Create: `src/iso/api/sse.ts`
- Modify: `src/iso/panel/Panel.tsx`

**Steps:**
1. Implement `POST /v1/jobs` and SSE `GET /v1/jobs/:id/events`.
2. Stream `delta` events to the chat transcript.
3. Render `patch` event with “Apply” button.
4. Manual test: end-to-end rewrite selection.
5. Commit: `feat(extension): run jobs via host + stream`.

---

### Task 11: First workflow: “Rewrite selection”

**Files:**
- Create: `host/src/workflows/rewriteSelection.ts`
- Modify: `host/src/routes/jobs.ts`

**Steps:**
1. Define prompt contract: preserve LaTeX commands, citations, labels.
2. Return `replaceSelection` patch only.
3. Manual test: rewrite keeps \cite{} and \ref{} intact.
4. Commit: `feat(host): rewrite selection workflow`.

---

### Task 12: “Fix compile error” workflow (selection-only v1)

**Files:**
- Create: `host/src/workflows/fixCompileError.ts`
- Modify: `host/src/routes/jobs.ts`

**Steps:**
1. Input: compile log excerpt + surrounding context.
2. Output: minimal patch to selection or nearby lines.
3. Manual test: fix a known Overleaf error.
4. Commit: `feat(host): fix compile error workflow`.

---

## TODO (Codex CLI Support Later)

- Add: `host/src/runtimes/codex/*` adapter calling `codex exec --json`.
- Add provider selection in UI.
- Add MCP tool integration for arXiv/bib metadata.

---

## Developer Workflow (Real-time Testing)

- Terminal A: `cd host && npm run dev`
- Terminal B: `npm run watch`
- Chrome: load unpacked from `build/`.
- After rebuilds: reload extension in `chrome://extensions`, refresh Overleaf tab.
