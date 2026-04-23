# Smart Hybrid Context Policy

## Goal

Design a context policy for Ageaf that balances three competing requirements:

1. Minimize token usage
2. Preserve high-quality rewrite and edit behavior
3. Match user expectations so users do not need to micromanage selection or context state

The current implementation sends `selection`, `surroundingBefore`, and `surroundingAfter` on every request from the panel. This is simple but too aggressive for normal chat and meta follow-up turns.

## Current State

- The panel builds one shared context object for every request and always includes:
  - `message`
  - `selection`
  - `surroundingBefore`
  - `surroundingAfter`
- `surroundingBefore` and `surroundingAfter` come from the active editor buffer, not from project search.
- Claude, Codex, and Pi already have project search capability or equivalent retrieval guidance.
- Session history is separate from per-turn injected context:
  - Claude and Codex primarily rely on underlying resumed sessions/threads.
  - Pi primarily relies on Ageaf-managed in-memory agent sessions.

This means the current problem is not session memory itself. The problem is that Ageaf injects too much local editor context into turns that do not need it.

## Design Principles

1. Separate session memory, local editor context, and workspace retrieval.
2. Treat `selection` and `surrounding context` as different resources.
3. Prefer deterministic policy rules over opaque classification.
4. Default to the smallest sufficient context.
5. Escalate context only when the task actually needs it.
6. Keep the policy explainable and testable.

## Context Layers

### 1. Session Memory

Conversation continuity owned by the runtime session:

- Claude: resumed conversation via `conversationId` / session state
- Codex: resumed thread via `threadId`
- Pi: Ageaf-managed `conversationId` session

Session memory should remain the default continuity mechanism for follow-up turns.

### 2. Local Editor Context

Per-turn context pulled from the active editor:

- `selection`
- `surroundingBefore`
- `surroundingAfter`

This is useful for local rewrite, explanation, or patch tasks, but expensive and often unnecessary for general chat.

### 3. Workspace Retrieval

On-demand project understanding through:

- grep or search tools
- file reading
- symbol lookup
- file blocks already included in the request

This should be the default mechanism for codebase-wide or notation-wide questions.

## Recommended Architecture

Introduce an explicit context policy layer before request payload construction:

1. `detectIntent(...)`
2. `computeContextPolicy(...)`
3. `buildContextPayload(...)`

The policy layer returns structured decisions such as:

- `attachSelection: boolean`
- `surroundingMode: 'none' | 'narrow' | 'wide'`
- `surroundingBudgetChars: number`
- `preferRetrieval: boolean`
- `reason: string[]`

This keeps the decision logic centralized instead of spreading it across panel request assembly and runtime prompt building.

## Intent Categories

Use deterministic rules plus lightweight heuristics to place each turn into one of five categories:

1. `edit_local`
2. `explain_local`
3. `meta_followup`
4. `codebase_query`
5. `file_wide`

### Hard Signals

- `action === 'rewrite'` -> `edit_local`
- Explicit rewrite/proofread UI entrypoint -> `edit_local`
- Whole-file wording such as `whole file`, `entire section`, `full document` -> `file_wide`
- Codebase lookup wording such as `where is`, `find`, `defined`, `macro`, `notation`, `which file` -> `codebase_query`

### Soft Signals

- Meta wording such as `刚才`, `above`, `earlier`, `上一个回复`, `你刚写的` -> `meta_followup`
- Local explanation wording such as `review this paragraph`, `explain this selected text` -> `explain_local`
- Active selection is a weak signal only. It must not force local-context attachment by itself.

## Policy Matrix

### `edit_local`

Use for rewrite/paraphrase/proofread/improve-selected-text flows.

- `selection`: on
- `surrounding`: narrow
- `preferRetrieval`: false

Rationale: local edits need immediate linguistic and structural context.

### `explain_local`

Use for reviewing or explaining a selected paragraph/snippet.

- `selection`: on
- `surrounding`: usually none
- `surrounding`: narrow only when the request clearly depends on local continuity or nearby structure
- `preferRetrieval`: false

Rationale: most explanation tasks need the selected text itself more than nearby editor text.

### `meta_followup`

Use for short follow-up questions about the prior assistant response or earlier turn.

- `selection`: off
- `surrounding`: none
- `preferRetrieval`: false

Rationale: the runtime session already carries prior conversation history. Active editor selection should not silently pollute a meta turn.

### `codebase_query`

Use for symbol lookup, macro tracing, notation questions, and file-location questions.

- `selection`: off by default
- `surrounding`: none
- `preferRetrieval`: true

Rationale: these tasks are better served by search/read flows than by injecting nearby editor text.

### `file_wide`

Use for whole-file review or full-document proofread tasks.

- `selection`: off
- `surrounding`: none
- `preferRetrieval`: true or file-block-driven

Rationale: local cursor context is the wrong abstraction for file-wide work.

## Budget Rules

The current default surrounding-context budget is too large for normal chat. Replace it with a policy-driven budget.

### Baseline Budgets

- `meta_followup`: `selection = 0`, `surrounding = 0`
- `explain_local`: `selection only`
- `edit_local`: `selection + narrow surrounding`
- `codebase_query`: retrieval-first
- `file_wide`: retrieval-first or file-block-first

### Surrounding Budget

Initial recommendation:

- `narrow`: 400-800 characters total around the selection
- `wide`: reserved for rare fallback cases only

Do not use the current always-on 5000-character default for normal turns.

### Adaptive Shrinking by Session Usage

- `<30%` session usage: standard budget
- `30%-60%`: halve surrounding budget
- `>60%`: disable surrounding except for `edit_local`
- `>80%`: allow only `selection_only` or retrieval-first

Rationale: avoid compounding cost as sessions age.

## Fallback Strategy

Do not start with the richest context. Escalate in steps:

1. `none`
2. `selection_only`
3. `selection_narrow_surrounding`
4. retrieval + explicit search/read guidance
5. `wide` surrounding only as rare last resort

Fallback should be triggered by clear failure modes such as:

- the model explicitly lacking local continuity
- low-quality local rewrite due to missing nearby structure
- repeated ambiguity around what selected text refers to

## User Experience

Users should not have to manually manage context most of the time, but the system should remain understandable.

### Lightweight Visibility

Expose a small, non-intrusive per-turn badge such as:

- `Using selection`
- `Using local context`
- `Using codebase search`
- `Selection ignored for this turn`

This gives users an explanation without requiring them to tune low-level knobs.

### Manual Overrides

Provide low-frequency overrides for advanced cases:

- `Use selected text only`
- `Include nearby context`
- `Search project instead`

These should be optional escape hatches, not the default workflow.

## Implementation Plan

### Phase 1: Policy Layer

- Add a pure policy module in the extension layer
- Detect intent from action, UI entrypoint, message text, and selection presence
- Compute normalized context policy
- Build request context from that policy instead of unconditional `selection/before/after`

### Phase 2: UI Transparency

- Show a small indicator for what context was attached
- Keep the language terse and non-technical

### Phase 3: Budget Controls

- Replace unconditional surrounding budget with policy-driven budget
- Add session-usage-aware shrinking

### Phase 4: Runtime Consistency

- Ensure Claude, Codex, and Pi all receive the same normalized context contract
- Keep provider-specific prompt logic from drifting in behavior

## Testing Plan

### Policy Unit Tests

- `meta_followup + active selection` -> `selection off`, `surrounding none`
- `rewrite + selection` -> `selection on`, `surrounding narrow`
- `explain selected text` -> `selection on`, `surrounding none|narrow`
- `codebase query` -> `preferRetrieval true`, no surrounding
- `high usage session` -> budgets shrink
- `manual override` -> override wins over heuristic

### Payload Integration Tests

- Panel request payload matches computed policy
- No silent surrounding context attachment on meta turns
- Rewrite flows still include sufficient local context

### Provider Consistency Tests

- Claude receives normalized context contract
- Codex receives normalized context contract
- Pi receives normalized context contract

These tests should validate policy behavior first, not model quality.

## Recommendation

Implement the policy-matrix approach with staged fallback.

This approach best balances:

- lower token cost
- stable local rewrite quality
- user expectations that normal follow-up turns should not be hijacked by whatever text happens to still be selected

The key decision is:

`selection` and `surrounding context` must no longer be automatically attached together on every turn.
