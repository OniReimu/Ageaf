# AGENTS Guidelines for This Repository

This repository contains **Ageaf**, a Chrome extension (Manifest V3) plus a small local
host process:

- **Extension (root)**: TypeScript + Preact content scripts that inject a right-side
  panel into Overleaf and talk to a local host via HTTP + SSE.
- **Host (`host/`)**: Fastify server that runs the Claude runtime via Claude Code CLI /
  Claude Agent SDK.

Follow the guidelines below when working interactively with an agent (e.g. Codex CLI)
to keep iteration fast and avoid breaking the local dev loop.

## 1. Prefer the Dev Loops (`watch` / `dev`)

### Extension (root)

* **Prefer `npm run watch` while iterating**. It rebuilds the extension bundles and
  writes to `build/`.
* Use `npm run build` when you explicitly want a production build (slower, but fine).

### Host (`host/`)

* **Use `npm run dev`** (`tsx watch`) while iterating on the host.
* Bind to localhost only (default `127.0.0.1:3210`). Do not change this to `0.0.0.0`
  without an explicit security plan.

## 2. Chrome “Load unpacked” + Reload Workflow

* In Chrome, load unpacked **from `build/`**.
* After changes:
  1. Ensure the extension has rebuilt (`npm run watch` output looks healthy).
  2. Go to `chrome://extensions` and click **Reload** on Ageaf.
  3. Refresh the Overleaf tab so the updated content script runs.

## 3. Keep Dependencies in Sync (Two Node Projects)

This repo has **two** separate dependency trees:

1. Root `package.json` / `package-lock.json` (extension build + tests)
2. `host/package.json` / `host/package-lock.json` (host server + runtime)

If you add/update dependencies, update the correct lockfile and restart the relevant
dev process (`npm run watch` and/or `cd host && npm run dev`).

## 4. Testing

* Extension tests: `npm test`
* Host tests: `cd host && npm test`

For quick end-to-end verification:
1. Start host: `cd host && npm run dev`
2. Load/reload extension from `build/`
3. Open Overleaf and send a message; confirm `/v1/jobs` and `/v1/jobs/:id/events`
   succeed (no CORS errors).

## 5. Coding Conventions

* Prefer TypeScript (`.ts`/`.tsx`) and small, explicit functions.
* Follow existing Preact patterns in `src/iso/panel/` and `src/main/editorBridge/`.
* Do **not** use `import { lazy, Suspense } from 'preact/compat';` in Ageaf. This
  breaks the extension UX and makes the panel unusable in practice.
* Avoid adding a separate `options.html` page unless explicitly required; prefer the
  in-panel settings UI.
* Keep host endpoints compatible with browser fetch (CORS + preflight + SSE headers).

## 6. Useful Commands Recap

| Command | Where | Purpose |
| --- | --- | --- |
| `npm run watch` | repo root | Rebuild extension to `build/` while iterating |
| `npm run build` | repo root | Production extension build |
| `npm test` | repo root | Run extension unit tests |
| `npm run dev` | `host/` | Start host server with hot reload |
| `npm test` | `host/` | Run host unit tests |
