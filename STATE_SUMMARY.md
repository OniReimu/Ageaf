# STATE_SUMMARY

Last updated: 2026-01-24 (local) — by Codex

## 1) One-paragraph summary
Ageaf is an MV3 Chrome extension that injects a right-side chat panel into Overleaf and talks to a local host (Fastify + SSE) to run Claude Code and Codex CLI sessions. The UI now includes session tabs, provider switching (Anthropic/OpenAI), runtime controls, and persistent chat history, and the context-usage ring has been updated to show cached last-known usage immediately with a throttled background refresh.

## 2) Current status (high signal)
- ✅ Working: chat panel UI in Overleaf; host + extension communication over HTTP/SSE; multi-session tabs; provider switch; cached context usage display; most tests and build pass.
- ⚠️ Known limitations: host must be running locally; context usage accuracy depends on CLI /context or Codex usage events; Codex usage may be unavailable until a thread has activity.
- ❌ Broken / failing: none known after latest tests/build.

## 3) How to run (copy/paste)
### Setup
- Extension deps: `npm install`
- Host deps: `cd host && npm install`

### Main workflow
- Terminal A (host): `cd host && npm run dev`
- Terminal B (extension): `npm run watch`
- Load unpacked extension from `build/` in `chrome://extensions` and reload.

### Test / validation
- Extension tests: `npm test`
- Extension build: `npm run build`
- Host tests: `cd host && npm test` (not run in this session)

## 4) Key commands and flags
### CLI entrypoints
- `npm run watch`: rebuilds extension to `build/` while developing.
- `npm run build`: production build of extension.
- `cd host && npm run dev`: run local host server (127.0.0.1:3210).

### Important flags
- Codex CLI approval policy is controlled via settings (OpenAI approval policy).
- Claude Code “YOLO mode” toggles `--dangerously-skip-permissions` behavior (mapped in settings).

## 5) Architecture / modules (what to read first)
- `docs/plans/2026-01-21-ageaf-rebuild.md`: master rebuild plan and API shape.
- `src/iso/panel/Panel.tsx`: core UI logic (sessions, streaming, runtime controls, context usage).
- `src/iso/panel/panel.css`: panel layout/styling.
- `src/iso/panel/chatStore.ts`: chrome.storage.local chat persistence and per-session provider state.
- `src/iso/api/client.ts`: host API client (jobs, runtime metadata, context usage).
- `host/src/routes/jobs.ts`: host job routing/SSE.
- `host/src/runtimes/claude/*` and `host/src/runtimes/codex/*`: runtime adapters.

## 6) Non-obvious decisions (avoid re-learning)
- Chat history is stored in `chrome.storage.local` per Overleaf project ID, with sessions ordered by `createdAt` across providers.
- Context usage is cached per conversation (`providerState.*.lastUsage`) and shown immediately, then refreshed in the background (Claude 15s throttle, Codex 5s).
- Codex context usage depends on a stored `threadId` and may be unavailable until a message produces usage events.

## 7) Recent validation results
Record what was run and what it returned (keep concise).
- 2026-01-24: `npm test` → PASS (72 tests)
- 2026-01-24: `npm run build` → PASS

## 8) Open issues / TODO next
- [ ] Consider verifying CLI context usage accuracy vs UI and adjust refresh strategy if needed.
- [ ] Run host tests (`cd host && npm test`) after next host-side changes.

## 9) Changelog (state-summary-only)
- 2026-01-24: documented context-usage caching + throttled refresh and current test/build status.
