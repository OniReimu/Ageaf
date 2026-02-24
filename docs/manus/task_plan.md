# Claude Compaction Parity vs CodePilot

**Goal:** Produce an evidence-based comparison of CodePilot vs Ageaf Claude compaction logic and define a prioritized plan to close the highest-impact gaps.

**Current Phase:** 5 - Delivery

## Phases

### Phase 1: Requirements & Discovery
- [x] Confirm CodePilot compaction ingress, session handling, and status signaling
- [x] Confirm current Ageaf Claude compaction ingress, runtime behavior, and retry/error handling
- [x] Record parity gaps and severity

**Status:** complete

### Phase 2: Planning & Structure
- [x] Convert gaps into a concrete implementation roadmap
- [x] Define rollout order and compatibility constraints
- [x] Document decisions and open questions

**Status:** complete

### Phase 3: Implementation
- [x] Wire Claude compaction command path in host/runtime
- [x] Add compaction lifecycle status events for panel consumption
- [x] Add overflow-triggered compact-and-retry behavior for Claude runtime
- [x] Persist and use explicit Claude SDK session ID for resume
- [x] Add/adjust tests for Claude compaction lifecycle and retry behavior

**Status:** complete

### Phase 4: Testing & Verification
- [x] Run host tests (Claude runtime + compaction paths)
- [x] Validate panel SSE behavior under compact/retry scenarios
- [x] Verify no regression in existing Codex compaction logic

**Status:** complete

### Phase 5: Delivery
- [x] Summarize findings and final plan
- [x] Capture residual risks and follow-up tasks
- [x] Prepare handoff notes

**Status:** in_progress

## Key Questions
- Should Claude compaction be explicit user command only, automatic overflow fallback, or both?
- Should we persist Claude SDK session IDs separately from job IDs for exact continuation semantics?
- Do we standardize compaction status events across Codex and Claude runtimes at the protocol layer?

## Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Start a new manus task and archive previous completed task | Required by manus workflow when `.active` is missing | 2026-02-23 |
| Treat Claude compaction gap as high-priority parity work | Missing end-to-end compaction behavior causes hard failures on context pressure | 2026-02-23 |
| Reuse existing panel plan-phase protocol for Claude compaction lifecycle | Minimizes UI churn and leverages existing compaction status rendering | 2026-02-23 |
| Sequence fix as ingress -> lifecycle -> retry -> session persistence -> tests | Reduces risk by unlocking behavior first, then improving continuity and reliability | 2026-02-23 |
| Keep Claude session resume persistence host-side by conversationId map | Enables explicit SDK `resume` continuity without extension schema migration | 2026-02-23 |
| Use runtime-level direct `/compact` dispatch in `runClaudeJob` | Preserves existing jobs route contract while enabling native compact path | 2026-02-23 |

## Errors Encountered

| Error | Attempts | Resolution |
|-------|----------|------------|
| `rg` included non-existent `host/src/index.ts` path during scan | 1 | Re-ran search against existing `host/src` paths only |
| Tried to read non-existent `src/iso/panel/skillDirectives.ts` and `skillManifest.ts` | 1 | Located actual skill registry implementation in `src/iso/panel/skills/skillsRegistry.ts` and corresponding `Panel.tsx` call sites |
| Running host test script with target still executes full `test/**/*.test.ts` glob | 1 | Accepted broader run for RED confirmation; will still use targeted assertions from new parity test failures |
| Claude compact helper left timeout timers alive after success (test run hung until 60s timeout logs) | 1 | Cleared timeout in `sendClaudeCompact` finally block |

## Notes
- Re-read this plan before major edits.
- Keep findings source-grounded with file references.
