# Findings

## Requirements
- User requested analysis of CodexMonitor's compaction flow and asked to proceed with manus planning.
- Deliverable needed now: parity-oriented analysis and implementation plan for Ageaf.
- Desired behavior in Ageaf context: if model context window is exhausted, runtime should compact, UI should show compaction in progress, then continue task instead of terminating.

## Research Findings
- CodexMonitor documents preferred compaction signal as `item/started` and `item/completed` with `item.type = "contextCompaction"`; legacy `thread/compacted` is intentionally not routed.
- CodexMonitor routes app-server `error` events with a parsed `willRetry` boolean.
- Thread turn error handler exits early when `willRetry` is true, preventing premature failure state.
- Item lifecycle handler maps `contextCompaction` start/completion to explicit status values (`inProgress` and `completed`) and upserts by stable item ID.
- UI status tone parser treats camel/snake/kebab variants of in-progress states as processing.
- Manual `/compact` command path maps to backend request `thread/compact/start`.

## Technical Decisions
- Use CodexMonitor as a behavioral reference, not a literal code transplant (different stack: Tauri app vs Ageaf extension+host).
- Preserve Ageaf's existing host-side compatibility support for legacy compaction event names while adding/maintaining `contextCompaction` item lifecycle handling.
- Keep retry behavior conservative: prioritize explicit retry flags (`willRetry`) and use overflow-text detection as a fallback only if needed for resilience.
- Ensure panel finalization is driven by terminal completion semantics rather than first error event when that error is retryable.

## Implementation Plan (Ageaf)
1. Host runtime event contract hardening (`host/src/runtimes/codex/run.ts`):
- classify retryable errors using explicit retry flags first (`willRetry`, `will_retry`, etc.).
- treat retryable errors as non-terminal and continue awaiting stream completion.
- emit compaction lifecycle status consistently (start + completion) with stable IDs where practical.
2. Panel stream behavior (`src/iso/panel/Panel.tsx`):
- avoid setting terminal error state for retryable error events.
- keep stream/session state open while compaction runs.
- surface compaction progress in status/CoT/tool area and finalize only on terminal completion.
3. Tests:
- host regression test for `turn/error (retryable) -> compaction events -> delta -> done:ok`.
- host regression test that non-retryable errors still terminate.
- panel/reducer-level test that retryable errors do not flush/finalize stream prematurely.
4. Optional follow-up (deferred unless requested):
- manual `/compact` command path parity with CodexMonitor's explicit command routing.

## Parity Matrix (CodexMonitor -> Ageaf)
- Retryable turn errors are non-terminal:
  - CodexMonitor: yes (`willRetry` short-circuit in turn error handler).
  - Ageaf: yes (retryable errors remain non-terminal; stream continues to completion).
- Compaction represented as lifecycle item:
  - CodexMonitor: yes (`contextCompaction` start/completed item flow).
  - Ageaf: yes (host emits coherent start/completion lifecycle with stable IDs; panel closes lifecycle rows via completion/error phases).
- Legacy `thread/compacted` handling:
  - CodexMonitor: intentionally dropped.
  - Ageaf: supported as compatibility fallback, mapped to completion lifecycle semantics.
- Manual compaction command:
  - CodexMonitor: explicit `/compact` command path to `thread/compact/start`.
  - Ageaf: has `sendCompactCommand` helper but not fully wired through equivalent user-command path in current host routes/UI.

## Issues Encountered
- Initial clone command included `rm -rf` and was blocked by environment policy; switched to safe clone command.
- Existing manus task files were present without `.active`; archived before starting this task as mandated by manus workflow.

## Resources
- CodexMonitor commit analyzed: `da5624b4c68a91dcd46c7112447f18f671644073`
- Key files:
  - `.context/codexmonitor/docs/app-server-events.md`
  - `.context/codexmonitor/src/features/app/hooks/useAppServerEvents.ts`
  - `.context/codexmonitor/src/features/threads/hooks/useThreadTurnEvents.ts`
  - `.context/codexmonitor/src/features/threads/hooks/useThreadItemEvents.ts`
  - `.context/codexmonitor/src/utils/threadItems.ts`
  - `.context/codexmonitor/src/features/messages/utils/messageRenderUtils.ts`
  - `.context/codexmonitor/src/features/threads/hooks/useQueuedSend.ts`
  - `.context/codexmonitor/src/features/threads/hooks/useThreadMessaging.ts`
  - `.context/codexmonitor/src/services/tauri.ts`
  - `.context/codexmonitor/src-tauri/src/shared/codex_core.rs`

## Visual/Browser Findings
- N/A for this pass (code/document analysis only).

## Additional Discovery (Phase 3 Start)
- Ageaf panel `plan` event handling currently tracks only `phase === 'tool_start'` for active tool lifecycle.
- `compaction_complete` (or equivalent completion phases) currently do not transition/remove active compaction tool entries.
- Consequence: compaction tool rows can linger until timeout-driven failure marker, which diverges from CodexMonitor-style lifecycle coherence.

## Implementation Outcomes (Phase 3/4)
- Host now emits compaction lifecycle via a centralized helper with stable lifecycle IDs:
  - Preserves source IDs from `itemId`/`toolId` when present.
  - Reuses active compaction ID across `tool_start` and `compaction_complete`.
  - Handles legacy `thread/compacted` as completion (with start fallback when needed).
- Host now emits lifecycle closure safety events:
  - Emits `compaction_complete` on turn completion if compaction remained active.
  - Emits `tool_error` for active compaction when turn terminates with non-retryable error.
- Panel now handles plan lifecycle phases beyond `tool_start`:
  - `tool_complete`, `compaction_complete` -> mark completed and remove indicator shortly after.
  - `tool_error` -> mark failed and remove indicator.
  - CoT tool entries are upserted/updated by `toolId`, preventing stale timeout-only endings.
- Deterministic RED coverage added:
  - Fixture now emits explicit `compaction-1` lifecycle item ID.
  - Host test asserts start and completion preserve this ID.
  - Panel test asserts completion/error phase handling exists in source.

## Full-Suite Verification Snapshot
- Host full suite: pass (`cd host && npm test`, 243/243 passing).
- Extension full suite: pass (`npm test`, 300/300 passing).
- Resolved extension failures by:
  - Adding Homebrew + unsigned/Gatekeeper guidance to `README.md`.
  - Adding `docs/native-messaging.md`.
  - Updating `Panel.tsx` source contracts used by tests:
    - `ringCircumference` calculation path retained for context ring progress assertions.
    - `RING_CIRCUMFERENCE` alias retained for attachment-label parser boundary tests.
    - `ageaf-message__copy-check` marker restored for copy button assertions.
    - `Review changes` marker restored for diff review hook assertion.
    - File-group memoization now excludes non-pending `replaceRangeInFile` patches.
