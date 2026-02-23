# Findings

## Requirements
- Add a **Notation & Terminology Consistency Pass** feature in Ageaf.
- Detect and report:
  - Symbol reuse conflicts
  - Term drift
  - Inconsistent acronym expansion across files
- Use **button trigger only** (not slash-command skill behavior).
- Run as **full-project analysis**.
- Produce **report + draft fixes** (reviewable patches, no auto-apply).
- Enforce **first-use acronym expansion** rule.
- Treat glossary/acronym macros as authoritative, but still flag repeated prose contradictions.

## Design Document

### Product Behavior
- Add a dedicated `Notation Check` button in the panel action row.
- On click, execute full-project analysis over `.tex` files and glossary/acronym macro sources.
- Return grouped findings:
  - `symbol_conflict`
  - `term_drift`
  - `acronym_inconsistency`
- Each finding includes severity, canonical form, conflicting usages, and file/line references.
- Provide a `Draft Fixes` action that generates patch-review cards for accept/reject.

### Architecture & Data Flow
- Extension adds panel trigger and sends a dedicated analyze action.
- Extension collects full-project file payload (`{ path, content }[]`) using existing project file discovery/fetch paths.
- Host workflow runs two stages:
  1. Deterministic extraction/indexing (symbols, terms, acronyms, glossary mappings)
  2. LLM adjudication for ambiguous semantic drift cases only
- Analyze response is structured and grouped for UI rendering.
- Draft-fixes action returns `replaceRangeInFile` patch objects to reuse existing patch-review pipeline.

### Detection & Safety
- Deterministic stage builds canonical index from glossary definitions and project usage.
- Severity model:
  - High: conflicting symbol/acronym meaning
  - Medium: glossary-vs-prose contradiction
  - Low: stylistic drift without clear contradiction
- LLM input constrained to structured candidates + local context windows.
- LLM output constrained to strict schema.
- Partial scans must surface explicit warning with skipped files.
- Never auto-apply edits.

### Rollout & Verification
- Phase 1: analyze/report card.
- Phase 2: draft-fix generation into patch-review cards.
- Feature-flag the capability for safety rollout.
- Verify with unit tests (extension + host), integration tests (job/SSE/UI), and manual E2E over multi-file projects.

## Research Findings
- Existing Ageaf panel already supports:
  - Action buttons and chat job dispatch
  - Structured SSE event handling
  - Patch-review accept/reject pipeline
- Existing file discovery/fetch behavior in panel and bridge can be leveraged for full-project scanning.
- Action typing boundaries discovered:
  - Frontend action union is currently `type JobAction = 'chat' | 'rewrite' | 'fix_error'` in `src/iso/panel/Panel.tsx`.
  - Host route validates only those three actions in `host/src/routes/jobs.ts` and rejects unknown actions.
  - Workflow dispatch in `host/src/routes/jobs.ts` currently has dedicated branches for `rewrite` and `fix_error`, with `chat` as default runtime path.
- Patch-review pipeline already handles `replaceRangeInFile` end-to-end in the panel, so draft fixes for notation findings can reuse existing patch cards rather than introducing new apply mechanics.
- Host route dispatch details:
  - `host/src/routes/jobs.ts` validates provider/action and currently allows only `chat|rewrite|fix_error` for Codex.
  - Claude path short-circuits to dedicated workflow handlers for `rewrite` and `fix_error`, otherwise uses normal chat runtime.
- Existing workflow implementation pattern (`rewriteSelection`, `fixCompileError`):
  - Emits progress delta
  - Calls runtime text generation
  - Extracts structured result from markers
  - Emits `patch` and final `done`
  This pattern is suitable for a notation analyze/draft workflow pair.
- Client dispatch path:
  - Panel builds `JobPayload` and uses `createJob` + SSE stream via `src/iso/api/client.ts`.
  - New action support will likely require updating shared payload/action typing in `src/iso/api/httpClient.ts` and mirrored host payload handling.
- Panel integration points discovered:
  - Toolbar actions live in `src/iso/panel/Panel.tsx` around the existing buttons (rewrite/check-references/attach-files), so adding a new `Notation Check` button is straightforward.
  - `onCheckReferences` already demonstrates a full DOM scan + file fetch pattern (project entries via `detectProjectFilesFromDom`, then fetch content through doc-download + bridge fallback), which can be generalized for full-project notation analysis input.
- Shared payload/event typing observations:
  - `JobPayload.action` in `src/iso/api/httpClient.ts` is currently `string`, so frontend payload extension is easy, but host-side validation must be explicitly updated.
  - Host `JobEvent` type in `host/src/types.ts` already supports generic event payloads and `patch`, so notation analysis findings can be streamed via existing `delta/done` and/or included in final assistant text without introducing a new transport primitive for v1.
- Toolbar insertion and icon plumbing:
  - Action toolbar markup in `src/iso/panel/Panel.tsx` already composes small icon buttons with tooltip labels, so adding notation actions is low-risk.
  - `src/iso/panel/ageaf-icons.tsx` has dedicated toolbar icon exports and a single export map section, so adding a notation icon is straightforward.
- Message dispatch wiring:
  - `sendMessage(...)` already passes `action` and attachment content through shared payload context to host.
  - This supports full-project notation scans by attaching gathered file content as normal file attachments.
- Existing tests to extend:
  - Root panel tests (`test/*.test.cjs`) use static source assertions for toolbar actions.
  - Host tests (`host/test/*.test.ts`) already verify action acceptance/routing for Codex rewrite, providing a template for new action coverage.
- Implemented extension behavior:
  - Added two toolbar actions in `Panel.tsx`:
    - `Notation consistency pass` (`notation_check`)
    - `Draft notation fixes` (`notation_draft_fixes`)
  - Added full-project file collection for notation actions using:
    - DOM file discovery (`detectProjectFilesFromDom`)
    - doc-download fetch by file id
    - bridge fallback (`requestFileContent`)
  - Added guardrails:
    - extension whitelist (`.tex/.bib/.sty/.cls/.md`)
    - file and byte caps
    - warning blocks when files are skipped/unreadable
- Implemented host behavior:
  - Added workflow module `host/src/workflows/notationConsistency.ts`.
  - Added deterministic analyzers for:
    - acronym expansion conflicts (`\\newacronym`, `\\acro`, prose `Expansion (ACR)`)
    - symbol reuse conflicts (e.g., `Let $x$ denote ...`)
    - term drift for hyphenated canonical terms (including glossary names)
  - Added conservative patch synthesis for draft mode via `replaceRangeInFile`.
  - Added route support in `host/src/routes/jobs.ts` for both notation actions.
  - Added Codex prompt guidance for notation analysis vs draft-fix actions.
- Verification outcomes:
  - New panel and host notation tests pass.
  - Full host test suite passes (`241` pass, `0` fail).
  - Root build passes.
  - Root full test suite still has 6 pre-existing failing tests unrelated to notation work.
  - Host `tsc` build still has pre-existing unrelated TypeScript errors.

## Technical Decisions
- Prefer hybrid approach over pure rule-based or pure LLM for stability + semantic coverage.
- Keep workflows explicit and user-controlled by funneling edits through review cards.
- Treat glossary macros as canonical definitions; prose contradictions become findings, not silent rewrites.
- Keep `docs/manus/**` versioned in git for persistent cross-session traceability.
- Use two explicit actions:
  - `notation_check`: analyze and report findings.
  - `notation_draft_fixes`: generate conservative patch proposals for review.

## Issues Encountered
- RED test failures before implementation (resolved):
  - Panel missing notation actions.
  - Host Codex allowlist rejected notation actions.
  - Notation workflow module missing.
- Repository baseline issues (not introduced by this feature):
  - Root full test suite has 6 failing tests outside notation paths.
  - Host TypeScript build (`npm run build`) reports errors in untouched modules/tests.

## Resources
- `src/iso/panel/Panel.tsx`
- `src/main/editorBridge/bridge.ts`
- `host/src/routes/jobs.ts`
- `host/src/workflows/`
- `host/src/runtimes/`

## Visual/Browser Findings
- No browser/PDF/image-derived findings for this planning step.
