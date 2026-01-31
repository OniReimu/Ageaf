# Bundled Skills + Slash Command Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Ship a **zero-install, built-in skills system** in Ageaf, including the full set of **AI-research-SKILLs**, and expose them via a **`/` slash-command typeahead** inside the chat input.

**Architecture:** Bundle skill markdown files inside the extension build (static assets) + generate a lightweight `manifest.json` for discovery/search. In the panel UI, typing `/` opens a typeahead dropdown; selecting a skill inserts a `/skillName` directive. On send, the panel expands selected directives into **system prompt additions** (via `userSettings.customSystemPrompt`) for both providers (Anthropic + OpenAI), without requiring host changes.

**Tech Stack:** MV3 Chrome extension, TypeScript, Preact (panel UI), webpack (asset bundling), Node script for manifest generation, existing job payload `userSettings.customSystemPrompt`.

---

## 0) Scope / Acceptance Criteria (v1)

**Bundling**
- The extension ships with a set of built-in skills out-of-the-box (no user installs, no runtime downloads).
- AI-research-SKILLs are included (at least every upstream `SKILL.md`).
- A license/attribution for the vendored skill content is included.

**Slash menu UX**
- In the chat input, typing `/` opens a dropdown listing skills.
- Typing after `/` filters by **name**, **description**, and **tags**.
- Keyboard controls: ↑/↓ to move, Enter/Tab to select, Esc to close.
- Selecting a skill inserts a directive (recommended: `/skillName `).

**Runtime behavior**
- When sending a message that includes one or more `/skillName` directives, Ageaf loads each skill’s markdown content and appends it to the **system prompt** for that one request (so Claude/Codex get the skill instructions).
- The rest of the message is sent normally (directives may be stripped before sending to the model, depending on final UX choice).

---

## 1) Design choices (options + recommendation)

### Option A (recommended): Extension-first registry + prompt injection
- Bundle skills + manifest in the extension (via `public/skills/**`).
- Panel loads `skills/manifest.json` once.
- Panel expands `/skillName` → skill markdown and appends to `payload.userSettings.customSystemPrompt`.

**Pros:** zero host changes, fast iteration, works for both providers identically, easy to ship.
**Cons:** each send can increase prompt size when many skills are selected.

### Option B: Host-driven registry endpoints
- Host owns the registry and exposes `/v1/skills` + `/v1/skills/:id`.
- Panel calls host for list/content; host injects into provider runtime.

**Pros:** smaller request payloads, centralizes logic.
**Cons:** requires coordinated host releases; more moving parts.

### Option C: Provider-native skills integration
- Install bundled skills into provider-specific skill directories and rely on Claude/Codex native “skills” mechanisms.

**Pros:** maximum alignment with upstream tool ecosystems.
**Cons:** brittle across CLI versions; more “magic”; more filesystem writes; harder to debug.

**Recommendation:** Start with **Option A** (extension-first), keep the on-disk format compatible with the upstream “skills” model (YAML frontmatter + markdown body), and leave a clean seam to migrate to Option B/C later.

---

## 2) Data model

### 2.1 Skill asset layout (bundled)

Proposed layout (vendored, committed to repo):
- `public/skills/ai-research/**/SKILL.md` (copied from AI-research-SKILLs)
- `public/skills/ai-research/LICENSE` (upstream license)
- `public/skills/manifest.json` (generated)

### 2.2 `manifest.json` format (generated)

```json
{
  "version": 1,
  "generatedAt": "2026-01-31T00:00:00.000Z",
  "skills": [
    {
      "id": "ai-research/14-agents/langchain",
      "name": "langchain",
      "description": "Framework for building LLM-powered applications…",
      "tags": ["Agents", "RAG", "Tool Calling"],
      "source": "ai-research",
      "path": "skills/ai-research/14-agents/langchain/SKILL.md"
    }
  ]
}
```

Notes:
- `name` becomes the slash command: `/langchain`
- `id` is a stable unique identifier (path-based)
- `path` is an extension-relative URL used for `fetch(chrome.runtime.getURL(path))`

---

## 3) Slash menu UX behavior (v1)

- Trigger regex should match a “token start” to avoid URLs:
  - e.g. `(^|[\\s([{])\\/([A-Za-z0-9._-]*)$`
- When open:
  - ArrowDown/ArrowUp changes active option
  - Enter/Tab inserts selected option
  - Escape closes without changes
- Selection inserts: `/skillName ` (with trailing space)
- Filtering: `name`, `description`, `tags` (case-insensitive substring match)

---

## 4) Prompt assembly (v1)

### 4.1 Where skill text goes

Append to `payload.userSettings.customSystemPrompt` so it applies as system instructions for both:
- `host/src/runtimes/claude/run.ts` already appends `customSystemPrompt`
- `host/src/runtimes/codex/run.ts` already appends `customSystemPrompt`

### 4.2 How it looks in the system prompt

Append a block like:

```md
## Enabled Skills (Ageaf)

### /langchain
[skill markdown body…]

### /vllm
[skill markdown body…]
```

### 4.3 Directive stripping (UX decision)

Two acceptable v1 behaviors:
1) **Strip directives before sending to model** (recommended): user sees `/langchain` in their message history, but the model only sees the expanded system prompt.
2) Keep directives in message: simpler, but risks the model treating it as user content.

---

## 5) Implementation Plan (TDD, small commits)

### Task 1: Vendor AI-research skills into `public/skills/ai-research`

**Files:**
- Create: `public/skills/ai-research/**/SKILL.md`
- Create: `public/skills/ai-research/LICENSE`
- Doc: `docs/plans/2026-01-31-bundled-skills-slash-menu.md`

**Step 1: Add vendored files**
- Copy upstream `SKILL.md` files + upstream `LICENSE`.

**Step 2: Verify build output includes the files**
Run: `npm run build`  
Expected: `build/skills/ai-research/.../SKILL.md` exists.

**Step 3: Commit**
Run:
```bash
git add public/skills/ai-research
git commit -m "feat: vendor ai-research skills"
```

### Task 2: Generate `public/skills/manifest.json` from vendored files

**Files:**
- Create: `scripts/generate-skills-manifest.cjs`
- Create/Modify: `public/skills/manifest.json`
- Modify: `package.json` (hook generation into `build`/`watch`)
- Test: `test/skills-manifest.test.cjs`

**Step 1: Write failing test**
- Add a test that runs the generator against the vendored folder and asserts:
  - `manifest.skills.length > 50`
  - includes `name: "langchain"`
  - includes `path` that starts with `skills/ai-research/`

Run: `npm test`  
Expected: FAIL (generator doesn’t exist yet).

**Step 2: Implement generator**
- Walk `public/skills/**/SKILL.md`
- Parse YAML frontmatter (`---` … `---`) for: `name`, `description`, `tags`
- Emit stable `id` using the file’s relative directory (no hash)

**Step 3: Run test**
Run: `npm test`  
Expected: PASS

**Step 4: Wire generator into build**
- Add `prebuild` / `prewatch` scripts that run the generator before webpack starts.

**Step 5: Commit**
```bash
git add scripts/generate-skills-manifest.cjs public/skills/manifest.json package.json test/skills-manifest.test.cjs
git commit -m "feat: generate bundled skills manifest"
```

### Task 3: Add a panel-side skills registry (load + search + fetch body)

**Files:**
- Create: `src/iso/panel/skills/skillsRegistry.ts`
- Test: `test/skills-registry.test.cjs`

**Step 1: Write failing test**
- A unit test for `searchSkills(skills, query)`:
  - query matches by name/description/tags
  - stable ordering (exact-prefix first, then substring)

**Step 2: Implement minimal registry**
- `loadSkillsManifest(): Promise<SkillsManifest>` using `fetch(chrome.runtime.getURL('skills/manifest.json'))`
- `searchSkills(manifest, query): SkillEntry[]`
- `loadSkillMarkdown(entry): Promise<string>` with caching
- `stripFrontmatter(markdown): string`

**Step 3: Run tests**
Run: `npm test`  
Expected: PASS

**Step 4: Commit**
```bash
git add src/iso/panel/skills/skillsRegistry.ts test/skills-registry.test.cjs
git commit -m "feat: add panel skills registry"
```

### Task 4: Add `/` typeahead UI to the message editor

**Files:**
- Modify: `src/iso/panel/Panel.tsx`
- Modify: `src/iso/panel/panel.css`
- Test: `test/skills-slash-parse.test.cjs`

**Step 1: Write failing tests for slash parsing helpers**
- Test a helper like `getSlashQuery(textBeforeCursor)`:
  - matches `/lan` at token start
  - does not match `https://example.com/`

**Step 2: Implement skill dropdown state**
- Add state similar to mentions:
  - `skillOpen`, `skillResults`, `skillIndex`, and a `skillRangeRef`
- On editor input: update skill state (and mention state) without fighting IME composition.

**Step 3: Implement insertion**
- On selection, replace the `/query` range with `/skillName `.

**Step 4: Keyboard handling**
- Mirror mention UX for ↑/↓/Enter/Tab/Escape.

**Step 5: Basic styling**
- Reuse mention menu styling with a new class (e.g. `.ageaf-skill-menu`) to avoid coupling.

**Step 6: Run tests**
Run: `npm test`  
Expected: PASS

**Step 7: Commit**
```bash
git add src/iso/panel/Panel.tsx src/iso/panel/panel.css test/skills-slash-parse.test.cjs
git commit -m "feat: add skills slash-command menu"
```

### Task 5: Expand `/skillName` directives into system prompt per message

**Files:**
- Modify: `src/iso/panel/Panel.tsx`
- Test: `test/skills-directives.test.cjs`

**Step 1: Write failing test**
- Given an input string containing:
  - `/langchain` directive + user text
  - `/vllm` directive + user text
- Expect:
  - extracted skill names in order (deduped)
  - remaining message text has directives removed (if choosing “strip” behavior)

**Step 2: Implement extraction + expansion**
- At send time:
  - parse directives
  - load skill markdown bodies for each selected skill
  - append to the outgoing `payload.userSettings.customSystemPrompt`
  - send the cleaned message text in `payload.context.message`

**Step 3: Run tests**
Run: `npm test`  
Expected: PASS

**Step 4: Manual smoke test**
- Run `npm run watch`
- Reload unpacked extension from `build/`
- In Overleaf, type `/lan` → select LangChain → send
- Expect: response style follows the skill content (visible qualitative check)

**Step 5: Commit**
```bash
git add src/iso/panel/Panel.tsx test/skills-directives.test.cjs
git commit -m "feat: inject bundled skills into system prompt"
```

### Task 6: Update documentation

**Files:**
- Modify: `README.md` (or add a short section to `docs/`)

**Step 1: Document usage**
- How to use `/` menu
- How directives work (per-message)
- Note: skills are bundled and do not require separate installs

**Step 2: Commit**
```bash
git add README.md
git commit -m "docs: add bundled skills slash command usage"
```

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-01-31-bundled-skills-slash-menu.md`.

Two execution options:
1. **Subagent-Driven (this session)** — use `@superpowers:subagent-driven-development`
2. **Parallel Session** — open a new session and use `@superpowers:executing-plans`

Which approach do you want?

