# Notation & Terminology Consistency Pass

**Goal:** Implement a full-project, button-triggered notation/terminology consistency pass that reports issues and can generate reviewable draft fixes.

**Current Phase:** 5 - Delivery

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user requirements
- [x] Capture confirmed product decisions from brainstorming
- [x] Explore relevant extension + host code paths
- [x] Document findings

**Status:** complete

### Phase 2: Planning & Structure
- [x] Decide technical approach and boundaries
- [x] Define extension/host contract for analyze + draft-fix actions
- [x] Break into actionable implementation steps

**Status:** complete

### Phase 3: Implementation
- [x] Add panel trigger and analyze flow wiring
- [x] Add host workflow for deterministic extraction + hybrid adjudication
- [x] Add findings card UI and draft-fix action
- [x] Reuse patch review pipeline for suggested fixes

**Status:** complete

### Phase 4: Testing & Verification
- [x] Add/extend extension unit tests
- [x] Add/extend host unit tests
- [x] Run targeted and relevant test suites
- [x] Validate graceful degradation paths

**Status:** complete

### Phase 5: Delivery
- [x] Final review of behavior vs approved design
- [x] Summarize changes, risks, and verification evidence
- [x] Prepare handoff

**Status:** complete

## Key Questions
- Which glossary/acronym macro variants should be supported in v1 beyond `\\newacronym` and `\\acro`?
- What file/byte caps should gate full-project scans to keep UX responsive?
- How should findings map to confidence thresholds for auto-draft eligibility?

## Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Button-only trigger (no slash skill) | Feature depends on Overleaf project context and should be explicit UX action | 2026-02-24 |
| Full-project scope | User explicitly chose entire project consistency checks | 2026-02-24 |
| Report + draft fixes | Keeps user control by reusing patch review accept/reject flow | 2026-02-24 |
| Acronym rule: first-use expansion only | Clear, predictable default for academic manuscripts | 2026-02-24 |
| Glossary macros authoritative + prose contradiction flagging | Preserve explicit project definitions while still catching real drift | 2026-02-24 |
| Hybrid approach (deterministic + LLM adjudication) | Balances deterministic precision with semantic drift detection | 2026-02-24 |
| Track `docs/manus/**` in git | User chose manus files to be versioned rather than local-only | 2026-02-24 |
| Action contract uses `notation_check` + `notation_draft_fixes` | Keeps report and fix-generation explicit while staying button-driven | 2026-02-24 |

## Errors Encountered

| Error | Attempts | Resolution |
|-------|----------|------------|
| Root test suite has 6 existing failures unrelated to notation feature | Ran focused tests + full root suite to isolate failures | Logged failing tests explicitly; feature-specific tests pass |
| `cd host && npm run build` fails with pre-existing TypeScript errors outside touched files | Executed host build after implementation | Logged as pre-existing repository issue; host test suite passes |

## Notes
- Re-read this file before major design or implementation decisions.
- Keep findings/progress logs updated as exploration and coding proceed.
