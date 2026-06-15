# Findings

## Requirements
- Compare CodePilot's Claude compaction logic with current Ageaf Claude compaction behavior.
- Judge weakness/gaps in Ageaf implementation and provide practical improvement plan.
- Use manus persistent planning workflow.

## Design Document
- N/A (no prior brainstorming artifact provided for this task).

## Research Findings
- Follow-up user report (2026-02-24): patch-review cards render per-file before `Accept all`, then split into per-hunk after accept completes.
- Root cause in `src/iso/panel/Panel.tsx`: `fileGroupMap` construction filters `replaceRangeInFile` hunks to `status === 'pending'`; after acceptance status transitions to `accepted`, grouped card mapping disappears and each message falls back to individual `PatchReviewCard`.
- Initial prior-session observation: CodePilot appears to support native `/compact` command passthrough and visible status streaming.
- Initial prior-session observation: Ageaf has a Claude-specific `sendCompact.ts` helper that may not be wired into active request flow.
- Initial prior-session observation: Ageaf Codex runtime has stronger compaction lifecycle/retry handling than Claude runtime.
- Fresh scan confirms CodePilot stores and reuses `sdk_session_id` (`src/lib/db.ts`, `src/app/api/chat/route.ts`, `src/lib/claude-client.ts`), indicating explicit SDK session continuation semantics.
- Fresh scan confirms CodePilot marks `/compact` as SDK-native built-in command (`src/components/chat/MessageInput.tsx`), with streaming `status` SSE handling in both API collector and UI stream hook (`src/app/api/chat/route.ts`, `src/hooks/useSSEStream.ts`).
- Fresh scan confirms Ageaf has Claude compaction helper logic in `host/src/compaction/sendCompact.ts`, but codebase-level usage appears centered on Codex compaction lifecycle handling in `host/src/runtimes/codex/run.ts`; Claude runtime/search hits do not yet show equivalent lifecycle plumbing.
- CodePilot command ingress detail: `/compact` is a built-in command and intended to be sent as native SDK command; however, when user adds extra context to command badge, fallback expansion can drop `/compact` and send only user context (`src/components/chat/MessageInput.tsx`).
- CodePilot streaming/session detail: `/api/chat` passes `sdk_session_id` to SDK query options and collector persists updated `session_id` from status/result events, enabling resumable continuity (`src/app/api/chat/route.ts`, `src/lib/claude-client.ts`).
- Ageaf jobs route currently dispatches Claude requests only through `runClaudeJob` and does not route to `sendCompactCommand` (`host/src/routes/jobs.ts` vs `host/src/compaction/sendCompact.ts`).
- Ageaf Claude runtime currently wraps user input in a broad system/context envelope and always uses `continue: true` with per-conversation cwd, but no explicit SDK session-id persistence path analogous to CodePilot was found (`host/src/runtimes/claude/run.ts`, `host/src/runtimes/claude/agent.ts`, `host/src/runtimes/claude/cwd.ts`).
- Ageaf Claude runtime emits generic `plan` events for tool starts (`phase: tool_start`) but has no dedicated compaction lifecycle (`compaction_complete`/overflow-retry) handling; non-success result subtype exits as error (`host/src/runtimes/claude/agent.ts`).
- Ageaf panel supports compaction-related plan phases (`tool_complete`, `compaction_complete`, `tool_error`) if emitted, but Claude runtime currently does not emit those compaction completion/error phases (`src/iso/panel/Panel.tsx`, `host/src/runtimes/claude/agent.ts`).
- Ageaf panel slash handling is skill-manifest based (`loadSkillsManifest`, `processSkillDirectives`), not built-in command dispatch; recognized `/name` tokens are transformed into skill instructions appended via `customSystemPrompt`, and unresolved directives remain plain message text (`src/iso/panel/Panel.tsx`, `src/iso/panel/skills/skillsRegistry.ts`).
- Ageaf chat payload sends `context.message` into Claude runtime prompt envelope (JSON context + system guidance), so `/compact` is not sent as a direct SDK-native command in chat flow (`src/iso/panel/Panel.tsx`, `host/src/runtimes/claude/run.ts`).
- CodePilot caveat remains: `/compact` command badge can degrade when user adds extra text because final prompt becomes expanded prompt + user context, and `/compact` has no expansion template (`src/components/chat/MessageInput.tsx`).
- Ageaf test coverage around compaction is largely Codex-focused; Claude compaction tests cover helper-level lock behavior but not integrated job-route/runtime compaction lifecycle (`host/test/codex-compact-timeout.test.ts`, `host/test/codex-runtime-compaction-retry.test.ts`).
- Evidence of stronger Codex path in Ageaf: runtime has retry-flag detection, compaction lifecycle event emitter, legacy signal handling, and retryable-overflow waiting logic (`host/src/runtimes/codex/run.ts`).
- Jobs route import list and dispatch path include `runClaudeJob`/`runCodexJob` but no `sendCompactCommand`, reinforcing that compaction helper is currently not part of chat execution path (`host/src/routes/jobs.ts`).
- Host tests currently rely heavily on `AGEAF_CLAUDE_MOCK` for Claude job route/SSE smoke checks (`host/test/jobs-sse.test.ts`, `host/test/claude-runtime.test.ts`), so new Claude compaction behavior tests should include unit-style runtime tests that do not require real CLI availability.
- Existing compaction/retry coverage pattern in repo uses focused runtime tests with deterministic fixture-like inputs (`host/test/codex-runtime-compaction-retry.test.ts`), which can be mirrored for Claude parity tests.
- Repo also uses lightweight structural smoke tests to lock important event/type contracts (`host/test/file-started-events.test.ts`); this pattern can guard newly introduced Claude compaction/session-resume hooks.
- CodePilot extracts token usage from `result.usage` in-stream (`src/lib/claude-client.ts`), while Ageaf Claude host previously only read `result.modelUsage`; this mismatch can drop usage updates when SDK emits usage-only shape.
- Panel context refresh previously dropped forced refresh requests when `contextRefreshInFlightRef` was true, which explains stale ring state after `/compact` completion if a refresh race occurs.

## Implementation Findings
- Added a short `How to Update Ageaf` section in `README.md` with simple source and Homebrew update steps.
- Fixed `replaceRangeInFile` group-map behavior in `src/iso/panel/Panel.tsx` to include all statuses (not pending-only), with `firstPendingId` as visibility anchor to keep current pending cards visible while preserving grouped per-file rendering after accept/reject transitions.
- Updated `test/panel-file-summary.test.cjs` to assert grouping survives status transitions and does not depend on `status !== 'pending'` filtering inside the grouped-card memoization block.
- Updated `test/panel-feedback-action-order.test.cjs` to assert action ordering from `PatchReviewCard.tsx` (source of truth) instead of brittle slicing from `Panel.tsx`.
- Added direct Claude `/compact` dispatch in `runClaudeJob`; direct compact requests now bypass JSON context envelope and execute native compact flow (`host/src/runtimes/claude/run.ts`).
- Upgraded Claude compaction helper to emit lifecycle plan phases (`tool_start`, `compaction_complete`, `tool_error`) with stable compaction `toolId`, matching panel expectations (`host/src/compaction/sendCompact.ts`).
- Added overflow-triggered compact-and-retry orchestration in Claude runtime (`runClaudeJob`): if first turn ends with context-overflow-style error status/message, host compacts then retries once (`host/src/runtimes/claude/run.ts`).
- Implemented explicit Claude SDK session-id persistence by conversation in host state and wired SDK `resume` usage in query options (`host/src/runtimes/claude/state.ts`, `host/src/runtimes/claude/agent.ts`).
- Added Claude-agent test hooks for query injection and session-cache reset to enable deterministic unit tests of runtime behavior (`host/src/runtimes/claude/agent.ts`).
- Fixed timeout-handle leak in Claude compaction helper by clearing timeout in `finally`, eliminating 60s post-success test hangs (`host/src/compaction/sendCompact.ts`).
- Added parity test coverage in `host/test/claude-compaction-parity.test.ts` for direct compact transport, overflow retry path, and session resume continuity.
- Extended Claude usage extraction to support both `result.modelUsage` and `result.usage` payloads (camelCase + snake_case fields), aligning with CodePilot-style real-time usage parsing (`host/src/runtimes/claude/agent.ts`).
- Added panel-side queued refresh fallback so compaction-triggered forced refresh executes after any in-flight refresh completes (`src/iso/panel/Panel.tsx`).
- Added follow-up tests: `host/test/claude-usage-events.test.ts` and `test/panel-context-usage-refresh-queue.test.cjs`.

## Parity Gap Matrix

| Area | CodePilot | Ageaf (Claude path) | Gap Severity |
|------|-----------|----------------------|--------------|
| Manual `/compact` command ingress | Built-in command intended as SDK-native passthrough | No dedicated built-in command dispatch path in panel/host; `/compact` is handled through generic message/skill flow | High |
| Command transport shape | Chat API sends prompt text directly to SDK query call | Chat flow embeds message inside system+JSON context envelope | High |
| Session continuation | Persists `sdk_session_id` in DB and passes `resume` for subsequent turns | Uses per-conversation cwd + `continue: true`, but no explicit persisted SDK session ID | Medium-High |
| Compaction lifecycle visibility | Emits `status` events (init + notification hooks) consumed in stream UI | Panel supports compaction lifecycle phases, but Claude runtime does not emit compaction-specific completion/error phases | High |
| Auto overflow recovery | No custom logic found in scanned files (likely relies on SDK/runtime behavior) | Non-success subtype is terminal `done:error`; no Claude compact-and-retry orchestration | High |
| Compaction helper integration | N/A (inline command path) | `sendCompactCommand` exists but is not wired into `/v1/jobs` chat path | High |
| Test coverage for Claude compaction | Not assessed in this pass | Helper-level lock test only; no integrated Claude compaction lifecycle/retry tests | Medium |

## Technical Decisions
- Re-validate all prior observations directly from repository files before final recommendations.
- Produce a severity-ranked gap matrix and phased implementation roadmap.
- Prioritize end-to-end behavior before parity polish: wire compaction into active Claude job path first, then improve lifecycle semantics and retries.
- Keep compatibility with existing panel event model by emitting `plan` phases already supported (`tool_start`, `compaction_complete`, `tool_error`).
- Introduce Claude session persistence with minimal schema impact (conversation/provider state) before adding advanced retry policies.
- Treat CodePilot as reference for command/session/status ergonomics, but avoid copying its badge-context `/compact` fallback bug.
- Continue from existing approved parity design and implement directly (user explicitly requested implementation of all listed items).
- Use host-layer TDD first because most gaps are in host Claude runtime and jobs routing; defer panel test additions unless host protocol changes require them.
- Keep Claude compaction behavior compatible with existing panel semantics by reusing existing `plan` event phases already consumed in UI.
- Recommended rollout:
  1. P0: Dedicated Claude `/compact` dispatch path and direct command transport (not JSON-wrapped context).
  2. P0: Claude compaction lifecycle emissions (`tool_start`, `compaction_complete`, `tool_error`) mapped to stable `toolId`.
  3. P0: Overflow retry handling in Claude runtime (retryable overflow should not terminate stream immediately).
  4. P1: Persist explicit Claude SDK session ID and pass `resume` where supported.
  5. P1: Add integrated host tests for Claude compact command, overflow retry, and plan phase transitions.
  6. P2: UI refinement for compaction status text consistency across providers.

## Issues Encountered
- Existing manus files from earlier completed task were present without `.active`; archived them to start a fresh task.

## Resources
- `docs/manus/archive/2026-02-23-claude-compaction-parity/`
- `.context/codepilot_analysis/` (local clone of CodePilot)
- `host/src/runtimes/claude/`
- `host/src/compaction/`
- `host/src/routes/jobs.ts`
- `src/iso/panel/`

## Visual/Browser Findings
- N/A for this task (codebase and local file analysis).
