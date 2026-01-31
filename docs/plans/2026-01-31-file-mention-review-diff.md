# File Mention → Review Diff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a user sends a normal chat message that includes `@[file:...]`, Ageaf reliably proposes an interactive “Review changes” diff (as `replaceRangeInFile`) without needing the Rewrite button, and Accept applies the change back to Overleaf.

**Architecture:** The panel expands `@[file:...]` into `[Overleaf file: <path>]` + a fenced code block. The host prompts the model to emit the updated full file contents inside hidden `<<<AGEAF_FILE_UPDATE ...>>>` markers. The host diffs old vs new and emits `replaceRangeInFile` patch events for the panel to render and apply.

**Tech Stack:** Preact/TS extension, Fastify host, Claude Agent SDK runtime, Codex CLI runtime.

## Task 1: Codex prompt emits file-update markers

**Files:**
- Modify: `host/src/runtimes/codex/run.ts`
- Test: `host/test/codex-prompt-file-update-guidance.test.ts`
- Create: `host/test/fixtures/codex-check-file-update-guidance`

**Step 1: Write failing test**
- Add a Codex CLI fixture that inspects the `turn/start` prompt and emits a delta indicating whether guidance is present.
- Assert the delta contains `HAS_FILE_UPDATE_GUIDANCE` when `[Overleaf file:` blocks are included in the message.

**Step 2: Implement prompt guidance**
- When `[Overleaf file:` blocks are present, include explicit instructions to append updated file content in `<<<AGEAF_FILE_UPDATE ...>>>` markers at the end of the response.

**Step 3: Verify**
- Run: `cd host && npm test`
- Expected: all tests pass.

## Task 2: Apply `replaceRangeInFile` without disrupting active tab

**Files:**
- Modify: `src/main/editorBridge/bridge.ts`
- Test: `test/editor-bridge-restores-active-file-after-apply.test.cjs`

**Step 1: Write failing test**
- Add a test that asserts the bridge includes a helper to restore the original active tab after attempting `replaceInFile`.

**Step 2: Implement restoration**
- Introduce a small helper (`restoreActiveFile`) and use it in:
  - file reads (`requestFileContent`)
  - file applies (`replaceInFile`)

**Step 3: Verify**
- Run: `npm test`
- Expected: tests pass.

## Task 3: Manual QA checklist (Overleaf)

1. Start host: `cd host && npm run dev`
2. Rebuild extension: `npm run watch`
3. Reload extension from `build/` in `chrome://extensions`
4. Open Overleaf editor and the Ageaf panel
5. In chat, send: `Proofread @[file:main.tex]`
6. Confirm:
   - A “Review changes” diff card appears (not just plain prose)
   - Accept applies changes to `main.tex`
   - If a different file tab was active, Ageaf returns you to that tab after applying

