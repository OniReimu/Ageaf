# Diff Review UI Refinements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine the interactive diff review card UX (collapsed unchanged lines + per-added-segment copy buttons + expanded modal viewer) and restore green build/tests.

**Architecture:** Continue rendering diffs via `@pierre/diffs` SSR HTML inside a ShadowRoot, then post-process the Shadow DOM to (1) hide expand controls and rewrite collapsed-line labels, and (2) inject small copy buttons into contiguous added-line segments. Keep the review card itself “inline” with the assistant message and provide an expanded modal viewer for long diffs.

**Tech Stack:** Preact, TypeScript, Webpack, `@pierre/diffs`, Shiki themes.

---

### Task 1: Fix DiffReview TypeScript build failures

**Files:**
- Modify: `src/iso/panel/DiffReview.tsx`

**Steps:**
1. Reproduce: `npm run build`
   - Expected (before): TS2339 errors around `typingController.cancel()`.
2. Fix by moving the typing controller to a `useRef` so TS can’t constant-fold it to `never`, and ensure cleanup cancels prior controllers.
3. Re-run: `npm run build`
   - Expected: build succeeds.

---

### Task 2: Refine Shadow DOM post-processing for UX

**Files:**
- Modify: `src/iso/panel/DiffReview.tsx`
- Modify: `src/iso/panel/panel.css` (modal styles only; avoid relying on it for Shadow DOM)

**Steps:**
1. Ensure ShadowRoot style overrides exist for `.ageaf-diff-copy-btn` and collapsed-line indicator formatting (no reliance on light DOM CSS).
2. Ensure copy text extraction uses `[data-column-content]` to avoid line numbers and diff UI chrome.
3. Ensure collapsed unchanged sections show `— N unchanged lines hidden —` and expand buttons are hidden/non-interactive.

---

### Task 3: Restore/adjust unit tests to match the refactor baseline

**Files:**
- Modify/Delete: `test/panel-auto-compact-ui.test.cjs`
- Modify/Delete: `test/panel-manual-compact-updates-usage.test.cjs`
- Modify: `test/panel-chat-action.test.cjs`

**Steps:**
1. Reproduce: `npm test`
   - Expected (before): failures in the above tests (stale expectations).
2. Remove tests that refer to deleted “manual compaction” UI, and relax the “chat action” assertion to match current `sendMessage` signature.
3. Re-run: `npm test`
   - Expected: all tests pass.

---

### Task 4: Verification pass

**Commands:**
- `npm run build`
- `npm test`
- `cd host && npm test`

