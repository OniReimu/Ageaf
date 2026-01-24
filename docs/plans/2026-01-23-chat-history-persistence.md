# Chat History Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist Ageaf chat history per Overleaf project across refresh and navigation, without using cookies, supporting multiple conversations per project (Claude now, Codex later), with clear/new-chat controls.

**Architecture:** Keep UI state in memory, and persist a structured “conversation list + active conversation” object to extension storage keyed by Overleaf `projectId`. Each conversation records its `provider` (e.g. `claude`, later `codex`). Rehydrate on panel mount. Use debounced writes to avoid storage write spam, and prune history to a bounded size.

**Tech Stack:** Preact (`src/iso/panel/Panel.tsx`), `chrome.storage.local`, Node test runner (`node --test`).

---

## Storage design (recommended)

**Do not use cookies** for chat history (size limits, privacy, not extension-owned, messy invalidation). Use extension-owned storage:

- **In-memory**: current messages while the tab is open.
- **Session restore (refresh)**: rehydrate from storage on mount (no special-case needed).
- **Long-term persistence**: `chrome.storage.local` (survives browser restarts).

### Data model

**Project key**
- `projectId` = URL pathname segment after `/project/` (e.g. `/project/<id>`).

**Conversation store**
- `project:<projectId>:activeConversationId:<provider>` → string
- `project:<projectId>:conversations` → `{ [conversationId]: { provider, title?, createdAt, updatedAt } }`
- `project:<projectId>:conversation:<conversationId>` → `{ provider, createdAt, updatedAt, messages[] }`

**Messages**
- Store only what the UI needs to re-render: `role`, `content`, `statusLine?`, `createdAt`.
- Generate stable `message.id` on insert; don’t recompute on load.

**Retention**
- Keep last `N` messages per conversation (e.g. 200).
- Cap number of conversations per project (e.g. 20), prune oldest by `updatedAt`.

---

# Tasks

### Task 1: Add projectId extraction + storage helpers

**Files:**
- Create: `src/iso/panel/historyStore.ts`
- Modify: `src/iso/panel/Panel.tsx`
- Test: `test/panel-history-persistence.test.cjs`

**Step 1: Write the failing test**

Create `test/panel-history-persistence.test.cjs` asserting:
- `Panel.tsx` derives `projectId` from `window.location.pathname`
- `historyStore.ts` exists and exports `loadProjectState` / `saveConversation`

**Step 2: Run test to verify it fails**

Run: `node --test test/panel-history-persistence.test.cjs`
Expected: FAIL because `historyStore.ts` and wiring don’t exist.

**Step 3: Write minimal implementation**

Create `src/iso/panel/historyStore.ts`:
- `getProjectIdFromLocation(pathname: string): string | null`
- `loadProjectState(projectId, provider): Promise<{ conversationId, messages } | null>`
- `saveConversation(projectId, conversationId, provider, messages): Promise<void>`
- `setActiveConversation(projectId, provider, conversationId): Promise<void>`
- `clearConversation(projectId, conversationId): Promise<void>`
- `clearProjectConversations(projectId): Promise<void>`

**Step 4: Run test to verify it passes**

Run: `node --test test/panel-history-persistence.test.cjs`
Expected: PASS.

**Step 5: Commit**

`git add src/iso/panel/historyStore.ts src/iso/panel/Panel.tsx test/panel-history-persistence.test.cjs`
`git commit -m "feat: add project-scoped chat history store"`

---

### Task 2: Rehydrate chat history on mount

**Files:**
- Modify: `src/iso/panel/Panel.tsx`
- Test: `test/panel-history-persistence.test.cjs`

**Step 1: Write the failing test**

Extend `test/panel-history-persistence.test.cjs` to assert:
- `Panel.tsx` calls `loadProjectState(projectId, 'claude')` inside a `useEffect` on mount.

**Step 2: Run test to verify it fails**

Run: `node --test test/panel-history-persistence.test.cjs`
Expected: FAIL because Panel doesn’t load persisted state.

**Step 3: Write minimal implementation**

In `Panel.tsx`:
- Compute `projectId` once on mount.
- `useEffect(() => { loadProjectState(projectId, 'claude') ... setMessages(...) })`
- Ensure loaded `messages` already include stable ids (don’t regenerate ids on load).

**Step 4: Run test to verify it passes**

Run: `node --test test/panel-history-persistence.test.cjs`
Expected: PASS.

**Step 5: Commit**

`git add src/iso/panel/Panel.tsx test/panel-history-persistence.test.cjs`
`git commit -m "feat: restore chat history on panel mount"`

---

### Task 3: Persist chat history on message append (debounced)

**Files:**
- Modify: `src/iso/panel/Panel.tsx`
- Modify: `src/iso/panel/historyStore.ts`
- Test: `test/panel-history-persistence.test.cjs`

**Step 1: Write the failing test**

Extend `test/panel-history-persistence.test.cjs` to assert:
- `Panel.tsx` calls `saveConversation(...)` after messages change.
- The persistence is debounced (e.g. `setTimeout`/`clearTimeout` or `requestIdleCallback`).

**Step 2: Run test to verify it fails**

Run: `node --test test/panel-history-persistence.test.cjs`
Expected: FAIL.

**Step 3: Write minimal implementation**

In `Panel.tsx`:
- Add `useEffect` that watches `messages` and schedules a debounced `saveConversation`.
- Do not persist during streaming token-by-token; persist on:
  - user message enqueue
  - assistant message finalization
  - interrupt finalization

In `historyStore.ts`:
- Add pruning helper (max messages) before saving.

**Step 4: Run test to verify it passes**

Run: `node --test test/panel-history-persistence.test.cjs`
Expected: PASS.

**Step 5: Commit**

`git add src/iso/panel/Panel.tsx src/iso/panel/historyStore.ts test/panel-history-persistence.test.cjs`
`git commit -m "feat: persist chat history with debounce and pruning"`

---

### Task 4: Add user controls: New chat + Clear chat

**Files:**
- Modify: `src/iso/panel/Panel.tsx`
- Modify: `src/iso/panel/panel.css`
- Modify: `src/utils/helper.ts` / `src/types.ts` (if settings need new fields)
- Test: `test/panel-settings-ui.test.cjs` (or new test)

**Step 1: Write the failing test**

Add a test asserting:
- Settings modal includes “New chat” and “Clear chat” actions (or a dedicated history section).

**Step 2: Run test to verify it fails**

Run: `node --test test/panel-settings-ui.test.cjs`
Expected: FAIL.

**Step 3: Write minimal implementation**

In `Panel.tsx`:
- **New chat**: generate new `conversationId`, set `messages=[]`, persist new active id for provider `claude`.
- **Clear chat**: deletes messages in the current conversation, keeps conversation id.

**Step 4: Run tests to verify they pass**

Run: `node --test test/*.test.cjs`
Expected: PASS.

**Step 5: Commit**

`git add src/iso/panel/Panel.tsx src/iso/panel/panel.css test/*.test.cjs`
`git commit -m "feat: add new chat and clear chat controls"`

---

## Follow-up (optional)

- Conversation list UI (browse/switch past chats per project, per provider).
- “Clear all history” (project/global) gated behind a confirmation dialog.
- Migrate to IndexedDB if stored content grows (large attachments).
