# Interactive Diff Review (Cursor-like AI Edits) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Deliver a Cursor-like “AI edit review” flow in Overleaf: AI proposes LaTeX edits → user reviews a diff → user Accepts/Rejects → changes are applied back into the editor safely.

**Architecture:** Implement entirely in the Chrome extension overlay. Render diffs inside the existing Ageaf right panel using `@pierre/diffs` (vanilla JS `FileDiff`), and apply accepted changes via the existing CodeMirror bridge (granular `changes[]`, not full replacement).

**Tech Stack:** Manifest V3, TypeScript, Preact (panel UI), Overleaf CodeMirror 6 (via MAIN-world bridge), local host (HTTP + SSE), `@pierre/diffs` (Shiki-based diff renderer).

---

## 0) Step-by-step Scope (what we build first)

**Step 1 (ship first):**
- Handle `patch.kind === "replaceSelection"` only.
- Show diff + **Accept** / **Reject** (whole change only).
- Apply is **range-targeted + validated** (does not rely on whatever selection is active at click time).

**Step 2 (after step 1 is stable):**
- Optional polish: “Copy proposed text”, better empty-states, theme tweaks, perf knobs.

**Step 3 (v1+):**
- Hunk-level accept/reject (optional).
- Active-file diff (optional).

---

## 1) Current Ageaf Integration Points (reality check)

- **Patch UI:** `src/iso/panel/Panel.tsx` shows `Patch ready` + `Apply`, then calls `ageafBridge.replaceSelection(...)`.
- **Bridge contract (ISO → MAIN):** `src/iso/contentScript.ts` exposes `window.ageafBridge`, MAIN listens in `src/main/editorBridge/bridge.ts`.
- **Applying text “as a patch”:** `src/main/eventHandlers.ts` computes `diffChars` (fallback `diffWordsWithSpace`) and dispatches CodeMirror `changes[]`.

**Problem:** current Apply relies on the current selection at click time and can silently do nothing (or apply to the wrong place) if focus/selection moved.

---

## 2) Why `@pierre/diffs` Fits (and what to validate early)

**Pros**
- Accepts arbitrary old/new strings (perfect for “selection before vs selection after”).
- Vanilla JS `FileDiff` (no React requirement; Ageaf is Preact).
- Shadow DOM styling helps avoid Overleaf CSS collisions.

**Risks to validate in the first milestone**
- **MV3/CSP:** does it render without CSP errors on Overleaf?
- **Bundle size/perf:** does diff rendering feel OK for medium selections?
- **TS/webpack + ESM:** `@pierre/diffs` is ESM-only; confirm our webpack+ts-loader setup can bundle it.

---

## 3) UX Definition (Step 1)

When the host emits `patch: { kind: "replaceSelection", text: "..." }`, the panel shows a **Patch Review card**:

- Title: “Review changes”
- Actions: **Accept**, **Reject**, (optional) **Copy**
- Body: diff rendering of `oldText` (selection snapshot at send time) → `newText` (patch text)

**Accept behavior (safety first):**
- Apply only if the current doc slice at the stored range still equals the stored `oldText`.
- If mismatch: show a blocking warning + allow only safe actions (Copy, Regenerate).

---

## 4) Data Model (minimal)

Store *per jobId*:

```ts
type SelectionSnapshot = {
  selection: string;
  from: number;
  to: number;
  lineFrom?: number;
  lineTo?: number;
};

type PatchReviewState = {
  jobId: string;
  oldText: string;
  newText: string;
  from: number;
  to: number;
};
```

We derive `PatchReviewState` when the `patch` SSE event arrives.

---

## 5) Implementation Plan (TDD, small steps)

### Milestone A: Prove `@pierre/diffs` renders in the Ageaf panel

**Outcome:** “Diff renders in Overleaf via extension, no CSP errors.”

### Task A1: Add dependency + build proof

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Install**

Run: `npm i @pierre/diffs`

Expected: install succeeds.

**Step 2: Run tests**

Run: `npm test`

Expected: PASS.

**Step 3: Build**

Run: `npm run build`

Expected: PASS (no bundling errors about ESM).

If build fails due to ESM import issues:
- Try a plain `import { FileDiff } from '@pierre/diffs'` first (no dynamic import/code splitting).
- If still failing, revisit TypeScript module output (possible fix: set `tsconfig.json` `compilerOptions.module` to `esnext` and confirm webpack handles it).

### Task A2: Render-only `DiffReview` component (static sample behind a dev flag)

**Files:**
- Create: `src/iso/panel/DiffReview.tsx`
- Modify: `src/iso/panel/Panel.tsx`
- Modify: `src/iso/panel/panel.css`
- Test: `test/panel-diff-review-ui.test.cjs`

**Step 1: Write failing test**

Create `test/panel-diff-review-ui.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel has diff review hook', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /DiffReview/);
  assert.match(contents, /ageaf-diff-review/);
});
```

**Step 2: Run test (expect FAIL)**

Run: `node --test test/panel-diff-review-ui.test.cjs`

Expected: FAIL.

**Step 3: Implement `DiffReview`**

Create `src/iso/panel/DiffReview.tsx` (keep it tiny):

```tsx
import { useEffect, useRef } from 'preact/hooks';
import { FileDiff } from '@pierre/diffs';

type Props = { oldText: string; newText: string; fileName?: string };

export function DiffReview({ oldText, newText, fileName = 'selection.tex' }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<FileDiff | null>(null);

  useEffect(() => {
    if (!wrapperRef.current) return;
    instanceRef.current?.cleanUp();

    const fileDiff = new FileDiff({ theme: 'pierre-dark', diffStyle: 'split', overflow: 'scroll' });
    instanceRef.current = fileDiff;
    fileDiff.render({
      containerWrapper: wrapperRef.current,
      oldFile: { name: fileName, contents: oldText, lang: 'tex' },
      newFile: { name: fileName, contents: newText, lang: 'tex' },
    });

    return () => {
      fileDiff.cleanUp();
      if (instanceRef.current === fileDiff) instanceRef.current = null;
    };
  }, [oldText, newText, fileName]);

  return <div class="ageaf-diff-review" ref={wrapperRef} />;
}
```

**Step 4: Wire behind a temporary flag**

In `src/iso/panel/Panel.tsx` add a temporary constant like:

```ts
const DEBUG_DIFF = false;
```

and render `<DiffReview ...>` only when `DEBUG_DIFF` is true.

**Step 5: Add minimal CSS**

In `src/iso/panel/panel.css`:
- add `.ageaf-diff-review { max-height: 280px; overflow: auto; border: 1px solid var(--ageaf-panel-border); border-radius: 10px; }`

**Step 6: Run test (expect PASS)**

Run: `node --test test/panel-diff-review-ui.test.cjs`

Expected: PASS.

**Step 7: Manual verification**

Run: `npm run watch`

Manual:
1) Load unpacked from `build/`
2) Open Overleaf project
3) Flip `DEBUG_DIFF = true`
4) Confirm diff renders and console has no CSP errors

---

### Milestone B: Show diff review for real patches (still no apply)

**Outcome:** When a patch event arrives, user sees a diff instead of “Patch ready”.

### Task B1: Store per-job selection snapshots

**Files:**
- Modify: `src/iso/panel/Panel.tsx`
- Test: `test/panel-diff-review-ui.test.cjs` (extend)

**Step 1: Write failing test**

Extend `test/panel-diff-review-ui.test.cjs`:

```js
assert.match(contents, /SelectionSnapshot/);
assert.match(contents, /Map<.*jobId/i);
```

**Step 2: Run test (expect FAIL)**

Run: `node --test test/panel-diff-review-ui.test.cjs`

Expected: FAIL.

**Step 3: Implement snapshot storage**

In `Panel.tsx`, right where `bridge.requestSelection()` is called for a job:
- store `{ selection, from, to, lineFrom, lineTo }` in a `useRef(new Map())` keyed by the `jobId` that comes back from `/v1/jobs`.

**Step 4: Run test (expect PASS)**

Run: `node --test test/panel-diff-review-ui.test.cjs`

Expected: PASS.

### Task B2: Render a Patch Review card when `patch.kind === "replaceSelection"`

**Files:**
- Modify: `src/iso/panel/Panel.tsx`
- Modify: `src/iso/panel/panel.css`
- Test: `test/panel-diff-review-ui.test.cjs` (extend)

**Step 1: Write failing test**

Add assertions:

```js
assert.match(contents, /Review changes/);
assert.match(contents, /patch\\.kind\\s*===\\s*['"]replaceSelection['"]/);
assert.match(contents, /<DiffReview/);
```

**Step 2: Run test (expect FAIL)**

Run: `node --test test/panel-diff-review-ui.test.cjs`

Expected: FAIL.

**Step 3: Implement UI switch**

Replace the “Patch ready” row with a new card:
- Header: “Review changes”
- Buttons: Accept (disabled for now), Reject (clears patch)
- Body: `<DiffReview oldText={snapshot.selection} newText={patch.text} />`

**Step 4: Run tests**

Run: `npm test`

Expected: PASS.

---

### Milestone C: Safe apply (Accept/Reject all)

**Outcome:** Accept applies to the correct region even if focus moved, and fails safely if the document changed.

### Task C1: Add apply request/response to the bridge (range + expected old text)

**Files:**
- Modify: `src/main/editorBridge/bridge.ts`
- Modify: `src/iso/contentScript.ts`
- Modify: `src/main/eventHandlers.ts`
- Test: `test/editor-bridge-apply.test.cjs` (new)

**Bridge contract**

Request event: `ageaf:editor:apply:request`  
Response event: `ageaf:editor:apply:response`

Request payload:
```ts
{
  requestId: string;
  kind: 'replaceRange';
  from: number;
  to: number;
  expectedOldText: string;
  text: string;
}
```

Response payload:
```ts
{ requestId: string; ok: boolean; error?: string }
```

**Step 1: Write failing test**

Create `test/editor-bridge-apply.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Main editor bridge supports apply request/response', () => {
  const bridgePath = path.join(__dirname, '..', 'src', 'main', 'editorBridge', 'bridge.ts');
  const contents = fs.readFileSync(bridgePath, 'utf8');
  assert.match(contents, /ageaf:editor:apply:request/);
  assert.match(contents, /ageaf:editor:apply:response/);
});
```

**Step 2: Run test (expect FAIL)**

Run: `node --test test/editor-bridge-apply.test.cjs`

Expected: FAIL.

**Step 3: Refactor apply logic in `src/main/eventHandlers.ts`**

Goal: allow applying at an explicit `{from,to}` without checking “current selection”.

Refactor pattern:
- Extract the core algorithm to `applyReplacementAtRange(view, from, to, nextContent)`.
- Keep `onReplaceContent` as a tiny wrapper that calls the helper.

**Step 4: Implement MAIN-world apply handler**

In `src/main/editorBridge/bridge.ts`:
- listen for `ageaf:editor:apply:request`
- read `current = view.state.sliceDoc(from, to)`
- if `current !== expectedOldText`: respond `{ ok:false, error:'Selection changed' }`
- else: call `applyReplacementAtRange(view, from, to, text)` and respond `{ ok:true }`

**Step 5: Implement ISO-side promise wrapper**

In `src/iso/contentScript.ts`:
- add a `Map<requestId, resolve>` like existing selection/file request maps
- add listener for `ageaf:editor:apply:response`
- add `window.ageafBridge.applyReplaceRange(...) => Promise<{ok:boolean;error?:string}>`

**Step 6: Run tests**

Run: `npm test`

Expected: PASS.

### Task C2: Wire Accept/Reject buttons to safe apply

**Files:**
- Modify: `src/iso/panel/Panel.tsx`
- Test: `test/panel-diff-review-apply-ui.test.cjs` (new)

**Step 1: Write failing test**

Create `test/panel-diff-review-apply-ui.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel uses applyReplaceRange for patch review accept', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /applyReplaceRange|applyReplaceRange\\(/);
});
```

**Step 2: Run test (expect FAIL)**

Run: `node --test test/panel-diff-review-apply-ui.test.cjs`

Expected: FAIL.

**Step 3: Implement Accept/Reject**

In `Panel.tsx`:
- Reject: clear patch review state
- Accept:
  - call `await ageafBridge.applyReplaceRange({ from,to, expectedOldText: oldText, text: newText })`
  - if `ok:false`, show a warning and offer a “Copy proposed text” button

**Step 4: Run tests**

Run: `npm test`

Expected: PASS.

---

### Milestone D (optional): perf + polish

- If rendering is slow, try:
  - `diffStyle: 'unified'` (less DOM)
  - setting `lang: 'text'` for LaTeX if tokenization is heavy
  - avoid code splitting in content scripts (dynamic import chunks can be blocked by page CSP)

---

### Milestone E (optional): hunk-level accept/reject

Only after Milestones A–C are stable:
- Maintain `FileDiffMetadata` state and use `diffAcceptRejectHunk(...)`.
- “Apply selected” materializes a merged `newText`, then reuses the same safe `applyReplaceRange` request.

---

## 6) Manual QA Checklist (Step 1)

1) Start host: `cd host && npm run dev`  
2) Start extension build: `npm run watch`  
3) Reload extension from `build/` and refresh Overleaf  
4) Select text in the editor and ask for a rewrite  
5) Verify:
   - diff renders
   - Reject closes without changes
   - Accept applies only if doc region unchanged
   - if you edit the selection before Accept, it fails with a safe warning (no partial apply)

---

## 7) Decision (confirmed)

**Step 1 includes immediate apply:** clicking **Accept** applies the change right away via Milestone C’s safe `applyReplaceRange` bridge (range-targeted + validated).
