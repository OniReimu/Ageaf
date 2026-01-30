# Interactive AI Diff Proposals (Cursor-like) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** When the agent proposes edits to an Overleaf project file (e.g., `main.tex`), the Ageaf panel renders those edits as an interactive diff block in the conversation and lets the user **Accept** (apply) or **Reject** (dismiss) safely.

**Architecture:** MV3 Chrome extension overlay only (no Overleaf source changes). The host emits a structured **patch event** (SSE) separate from explanatory text. The panel renders a diff (via `@pierre/diffs`) and, on Accept, applies the change back into Overleaf via the MAIN‑world CodeMirror bridge using **range‑targeted + expected‑text validation** (`applyReplaceRange`).

**Tech Stack:** Manifest V3, TypeScript, Preact (panel UI), Overleaf CodeMirror 6 via MAIN‑world bridge, local host (HTTP + SSE), `@pierre/diffs` (diff UI), existing typed apply bridge.

---

## 0) Scope (step-by-step, keep v1 shippable)

**V1 (ship first):**
- Single proposal at a time.
- Proposal kind: **replace a range in a specific file** (`replaceRangeInFile`) even when the user did not explicitly select it.
- (Still supported) `replaceSelection` for quick “rewrite what I highlighted”.
- UI: diff block + file header + **Accept / Reject** controls.
- Accept applies safely by (a) requiring the target file be active in Overleaf, then (b) validating `expectedOldText` at the target location before writing (or failing with an instructional error).

**V2 (next):**
- Improve targeting robustness:
  - allow `from/to` to be optional and compute it by unique-match search (or by context anchors)
  - better “Open file” UX when activation fails
- UI polish: “Copy proposed text”, “Regenerate”, clearer mismatch warnings.

**V3 (optional):**
- Multiple hunks + per‑hunk selection.
- Multi‑file proposals.

---

## 1) Constraints & risks (what shapes the design)

- **Overleaf is closed‑source** → everything must be injected via extension; DOM/editor hooks can change.
- **Real‑time collaboration** → must never blindly overwrite; always validate expected old text.
- **MV3 + CSP + ESM** → diff libraries often rely on async chunks/workers; plan must include “renders on Overleaf” validation early and a fallback UI when diff renderer fails.
- **Performance** → full‑file diffs can be expensive; v1 stays selection‑scoped.

---

## 2) UX definition (Cursor-like “Proposed Change” block)

When a patch proposal exists, the conversation shows a card (system bubble is OK) with:
- Header: filename + `+N -M` counts, dismiss (×)
- Body: diff (split or unified)
- Actions: **Accept** (✓) and **Reject** (✕)
- Optional: “Copy proposed text” on failure

**Reject:** hides the proposal, no editor changes.  
**Accept:** applies change back into Overleaf at the intended location, or fails safely with a clear warning.

---

## 3) Data contracts (minimal, then extend)

### 3.1 Host → Panel (SSE `patch` event)

V1 shapes:
```ts
type Patch =
  | {
      kind: 'replaceRangeInFile';
      filePath: string;
      expectedOldText: string;
      text: string;
      // Optional location hint (when available).
      from?: number;
      to?: number;
    }
  | { kind: 'replaceSelection'; text: string }
  | { kind: 'insertAtCursor'; text: string };
```

**Note:** `from/to` are optional because counting characters inside a prompt is error-prone. If omitted, the apply path must locate a unique match of `expectedOldText` (or fail safely).

### 3.2 Panel snapshot (captured at send time)

```ts
type SelectionSnapshot = {
  filePath?: string;
  selection: string;
  from: number;
  to: number;
  lineFrom?: number;
  lineTo?: number;
};
```

**V1:** `filePath` is “best effort” (fallback to `selection.tex`).  
**V2:** `filePath` must be set and must match the patch target.

---

## 4) Diff rendering approach (recommended)

Use `@pierre/diffs/ssr` to generate HTML and inject it into a ShadowRoot. This avoids web‑component initialization issues and isolates styles from Overleaf.

**Important MV3/CSP note:** `@pierre/diffs/ssr` can still trigger async chunk loads (themes/langs). Ensure:
- webpack public path is the extension base URL at runtime
- async chunk JS matches the `vendors-*.js` pattern declared in `public/manifest.json` (`output.chunkFilename = 'vendors-[id].js'`)

Also add a **fallback renderer** (simple “old vs new” blocks) if diff rendering fails, so proposals never appear blank.

---

## 5) Implementation Plan (TDD, small steps)

### Milestone A: “Diff block never renders blank”

**Outcome:** If the diff renderer fails for any reason, the card still shows a readable fallback (old/new) and a debug hint.

**Files:**
- Modify: `src/iso/panel/DiffReview.tsx`
- Modify: `src/iso/panel/panel.css`
- Test: `test/panel-diff-review-ui.test.cjs` (extend)

**Step 1: Write failing test**

Extend `test/panel-diff-review-ui.test.cjs`:
```js
assert.match(diffContents, /fallback/i);
assert.match(diffContents, /try\\s*\\{/);
```

**Step 2: Run test (expect FAIL)**

Run: `node --test test/panel-diff-review-ui.test.cjs`  
Expected: FAIL.

**Step 3: Implement fallback UI**

In `DiffReview.tsx`:
- Wrap the async import / render in `try/catch`
- If it throws (or returns empty HTML), render:
  - a small header “Diff unavailable”
  - two `<pre>` blocks (old/new) with minimal styling

**Step 4: Run test (expect PASS)**

Run: `node --test test/panel-diff-review-ui.test.cjs`

---

### Milestone B: “Proposed Change” card matches UX spec

**Outcome:** Conversation shows a Cursor-like proposal block with file context + Accept/Reject.

**Files:**
- Modify: `src/iso/panel/Panel.tsx`
- Modify: `src/iso/panel/panel.css`
- Test: `test/panel-diff-review-ui.test.cjs` (extend)

**Step 1: Write failing test**

Add assertions:
```js
assert.match(contents, /Proposed|Review changes/);
assert.match(contents, /Accept/);
assert.match(contents, /Reject/);
```

**Step 2: Run test (expect FAIL)**

Run: `node --test test/panel-diff-review-ui.test.cjs`

**Step 3: Implement header polish**

- Show `filePath ?? 'selection.tex'` in the header (counts come from `@pierre/diffs`)
- Keep Accept/Reject in header

**Step 4: Run tests**

Run: `npm test`  
Expected: PASS.

---

### Milestone C: V1 “edit a file/range” proposals (scoped + safe)

**Outcome:** Patch proposals can target an explicit file + range, and Accept applies only if the file/range still matches expected old text.

**Files:**
- Modify: `host/src/runtimes/claude/agent.ts` (structured output schema)
- Modify: `src/iso/panel/Panel.tsx` (handle new patch kind)
- Modify: `src/iso/contentScript.ts` and/or MAIN bridge as needed
- Test: `host/test/*` + `test/panel-*.test.cjs`

**Step 1: Write failing tests**

Host: add a test asserting the structured schema allows `replaceRangeInFile`.  
Panel: add a test asserting `replaceRangeInFile` is recognized and rendered.

**Step 2: Implement host schema + event**

- Expand patch output schema with `filePath/expectedOldText/text` (+ optional `from/to`)
- Emit patch event with the new shape

**Step 3: Implement panel handling**

- Render diff using:
  - `oldText = expectedOldText` (from patch)
  - `newText = text` (from patch)
- Accept applies using the MAIN bridge:
  - require the requested file be the active Overleaf editor tab (V1)
  - validate `expectedOldText` either at `from/to` (if provided) or via unique-match search
  - if activation fails or match is ambiguous/missing: show “Open `<filePath>` in Overleaf and retry” (and keep “Copy proposed text”)

**Step 4: Manual QA**

Verify on Overleaf:
- Accept applies to correct location
- If the doc changes, Accept fails safely

---

## 6) Manual QA checklist (v1)

1) Start host: `cd host && npm run dev`
2) Start extension build: `npm run watch`
3) Reload extension from `build/` and refresh Overleaf
4) Select text in the editor and click “Rewrite selection”
5) Verify:
   - proposal card appears
   - diff is visible (or fallback shows old/new)
   - Reject closes without changes
   - Accept applies the change
   - editing the selection before Accept causes a safe failure (no partial apply)

6) Chat-driven proposals (V1 / optional):
   - In a normal chat message (no rewrite button), ask for a concrete edit and ensure the assistant includes a fenced patch block:
     ```ageaf-patch
     { ... }
     ```
   - Verify the host emits a `patch` event and the panel shows the review card even for chat replies.
