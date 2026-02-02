# Streaming CoT Display Analysis: Opcode vs Ageaf

## Executive Summary

**Current State in Ageaf:**
- Shows generic status messages: "Thinking 5s · ESC to interrupt", "Responding · ESC to interrupt"
- Already has infrastructure to display detailed plan messages (line 4614-4633 in Panel.tsx)
- **Root cause:** Backend isn't sending enough detailed `plan` events with human-readable messages

**Key Finding:** Ageaf's frontend is already prepared to display rich status messages. The gap is in the backend event generation.

---

## 1. Opcode's Implementation (Anthropic Provider)

### Architecture

Opcode uses a **Tauri backend** that spawns Claude CLI as a subprocess and parses its stdout:

```
User → Tauri Backend → Claude CLI subprocess → stdout/stderr parsing → Tauri events → React Frontend
```

### Event Types & Display

**Event Listeners** (from AgentExecution.tsx):
```typescript
// Four event channels per run:
- `agent-output:{runId}`      // Streamed JSONL messages
- `agent-error:{runId}`        // Runtime errors
- `agent-complete:{runId}`     // Completion signal
- `agent-cancelled:{runId}`    // User cancellation
```

**Message Types** (from StreamMessage.tsx):
```typescript
type ClaudeStreamMessage = {
  type: "assistant" | "user" | "result" | "system",
  message?: {
    content: Array<{
      type: "text" | "thinking" | "tool_use" | "tool_result",
      text?: string,
      thinking?: string,  // <-- Dedicated thinking block
      tool_use?: {...},
      tool_result?: {...}
    }>
  },
  usage?: {input_tokens, output_tokens},
  summary?: string,
  isMeta?: boolean
}
```

**Status Display Patterns:**

1. **System Messages** - Session initialization:
   ```
   "System initialization message"
   Model: claude-sonnet-4-5
   Working directory: /path/to/project
   Available tools: Bash, Read, Write, ...
   ```

2. **Thinking Blocks** - Extracted separately:
   ```tsx
   if (content.type === "thinking") {
     return <ThinkingWidget thinking={content.thinking || ''} />;
   }
   ```

3. **Tool Calls** - Real-time indicators:
   ```tsx
   <CheckCircle2 /> Reading file xyz.ts
   <CheckCircle2 /> Writing to output.js
   <AlertCircle /> Error in bash command
   ```

4. **Progress Indicators**:
   ```tsx
   <Loader2 className="animate-spin" />
   <div>Running · Elapsed {elapsedTime}s · {totalTokens} tokens</div>
   ```

5. **Execution Status Bar** (floats during run):
   ```tsx
   <ExecutionControlBar>
     ⏱️ 12.5s elapsed | 🎯 3,492 tokens | [Stop Button]
   </ExecutionControlBar>
   ```

### Key Insights from Opcode

✅ **Separates thinking from content** - Thinking blocks render in collapsible widgets, not inline

✅ **Tool execution visibility** - Every tool call shows name + icon + result status

✅ **Real-time metrics** - Token counts and elapsed time update live (100ms interval)

✅ **System context messages** - Session info displayed as first message

✅ **Rich event types** - Backend sends typed events (system/assistant/result/error)

---

## 2. Ageaf's Current Implementation

### Architecture

```
User → Panel.tsx → Bridge → Backend Job System → SSE Stream → Event Handler → UI Update
```

### Event Processing (Panel.tsx:4584-4648)

```typescript
await streamJobEvents(options, jobId, (event: JobEvent) => {
  // 1. Delta events (streamed content)
  if (event.event === 'delta') {
    const deltaText = event.data?.text ?? '';
    enqueueStreamTokens(sessionConversationId, provider, deltaText);
  }

  // 2. Plan events (status updates) ← KEY FOR COT DISPLAY
  if (event.event === 'plan') {
    const message = (event.data as any)?.message;
    if (typeof message === 'string' && message.trim()) {
      const status = `${message.trim()} · ESC to interrupt`;
      setStreamingState(status, true);  // ← Updates orange status line
    }

    // Show compaction messages in chat
    if (message.toLowerCase().includes('compact')) {
      setMessages((prev) => [...prev,
        createMessage({ role: 'system', content: message })
      ]);
    }
  }

  // 3. Trace events (debug mode)
  if (event.event === 'trace') {
    if (sessionState.debugCliEventsEnabled) {
      const message = String(event.data?.message ?? '').trim();
      setStreamingState(`${message} · ESC to interrupt`, true);
    }
  }

  // 4. Tool call events
  if (event.event === 'tool_call') {
    // ... approval/input handling
  }
});
```

### Current Status Messages (Hardcoded)

From Panel.tsx:3847-3889:
```typescript
// Thinking phase
setStreamingState(`Thinking ${elapsed}s · ESC to interrupt`, true);

// Responding phase
setStreamingState(`Responding · ESC to interrupt`, true);

// Working (no thinking mode)
setStreamingState('Working · ESC to interrupt', true);
```

### What Ageaf Currently Has

✅ **Plan event handler** - Already receives and displays `plan` events from backend

✅ **Compaction detection** - Shows compaction messages in chat when detected

✅ **Trace event support** - Can show detailed trace when debug mode enabled

✅ **Tool request UI** - Has approval/input modals for tool calls

❌ **Thinking block separation** - Thinking content mixed with regular deltas

❌ **Rich tool visibility** - No inline indicators for "Reading file X", "Running bash Y"

❌ **Backend event richness** - Backend doesn't emit detailed `plan` events

---

## 3. Gap Analysis: Why Ageaf Doesn't Look Like Expected

### Problem 1: Backend Event Sparsity ⚠️

**Issue:** Backend sends few `plan` events, mostly just thinking timer

**Evidence from screenshot:**
```
"Sending request to Claude..."      ← Manual status (not from backend)
"Claude: message_start"              ← Raw SSE event name (not helpful)
"Claude: message_stop"               ← Raw SSE event name (not helpful)
"Claude: content_block_start"        ← Raw SSE event name (not helpful)
"Claude: reply completed"            ← Manual status
```

**What should be happening:**
```
"Analyzing code structure..."        ← plan event
"Reading src/utils/parser.ts"        ← plan event
"Searching for similar patterns"     ← plan event
"Writing updated implementation"     ← plan event
"Running tests to verify"            ← plan event
```

### Problem 2: No Thinking Block Separation ⚠️

**Current:** Thinking content mixed into deltas as regular text

**Needed:** Parse thinking blocks from content and display separately

```typescript
// Need to add this type of parsing:
if (content.type === 'thinking') {
  // Render in collapsible widget, grayed out, with icon
  return <ThinkingDisplay content={content.thinking} />;
}
```

### Problem 3: Tool Execution Invisibility ⚠️

**Current:** Tool calls happen silently, only show approval prompts

**Needed:** Real-time tool execution indicators

```typescript
// When tool starts:
"🔧 Running Bash: npm test"

// When tool completes:
"✅ Bash completed (exit 0)"
// or
"❌ Bash failed (exit 1)"
```

---

## 4. Implementation Plan for Ageaf

### Phase 1: Backend Event Enrichment (Critical)

**Goal:** Backend emits detailed `plan` events for every significant action

**Changes needed in backend:**

1. **Before reading files:**
   ```json
   {"event": "plan", "data": {"message": "Reading src/components/Panel.tsx"}}
   ```

2. **Before tool execution:**
   ```json
   {"event": "plan", "data": {"message": "Running Bash: npm test"}}
   ```

3. **During analysis:**
   ```json
   {"event": "plan", "data": {"message": "Analyzing code structure"}}
   ```

4. **During writing:**
   ```json
   {"event": "plan", "data": {"message": "Writing implementation"}}
   ```

5. **Compaction (already works):**
   ```json
   {"event": "plan", "data": {"message": "Compacting chat history..."}}
   ```

### Phase 2: Frontend - Thinking Block Component

**File:** `src/iso/panel/ThinkingBlock.tsx` (new)

```typescript
export function ThinkingBlock({ content }: { content: string }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="ageaf-thinking-block">
      <div
        className="ageaf-thinking-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Brain className="thinking-icon" />
        <span>Chain of Thought</span>
        {collapsed ? <ChevronRight /> : <ChevronDown />}
      </div>
      {!collapsed && (
        <div className="ageaf-thinking-content">
          <Markdown content={content} />
        </div>
      )}
    </div>
  );
}
```

**CSS:** (add to panel.css)
```css
.ageaf-thinking-block {
  background: rgba(138, 180, 248, 0.1);
  border-left: 3px solid #8ab4f8;
  margin: 12px 0;
  border-radius: 4px;
  font-size: 0.9em;
}

.ageaf-thinking-header {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8ab4f8;
}

.ageaf-thinking-content {
  padding: 12px;
  color: var(--ageaf-panel-muted);
  border-top: 1px solid rgba(138, 180, 248, 0.2);
}
```

### Phase 3: Frontend - Streaming Delta Parser

**Modify** `Panel.tsx:4588-4612` to parse thinking blocks:

```typescript
if (event.event === 'delta') {
  const deltaText = event.data?.text ?? '';
  if (deltaText) {
    markThinkingComplete(sessionConversationId);

    // Check if this is a thinking block
    const thinkingMatch = deltaText.match(/<thinking>(.*?)<\/thinking>/s);
    if (thinkingMatch) {
      // Store thinking content separately
      sessionState.thinkingContent = (sessionState.thinkingContent || '') + thinkingMatch[1];
      return; // Don't add to regular stream
    }

    // Check if thinking block ended
    if (sessionState.thinkingContent && deltaText.includes('</thinking>')) {
      // Emit thinking as separate message
      setMessages(prev => [...prev,
        createMessage({
          role: 'thinking',
          content: sessionState.thinkingContent
        })
      ]);
      sessionState.thinkingContent = '';
      return;
    }

    enqueueStreamTokens(sessionConversationId, provider, deltaText);
  }
}
```

### Phase 4: Frontend - Tool Execution Indicators

**Modify** `Panel.tsx:4651-4700` to show inline tool status:

```typescript
if (event.event === 'tool_call') {
  const toolName = event.data?.tool;
  const toolInput = event.data?.input;

  // Show "Starting tool..." message
  setMessages(prev => [...prev,
    createMessage({
      role: 'system',
      content: `🔧 Running ${toolName}: ${JSON.stringify(toolInput)}`,
      meta: { toolId: event.data?.requestId }
    })
  ]);
}

if (event.event === 'tool_result') {
  const toolId = event.data?.requestId;
  const success = !event.data?.error;

  // Update the tool message with result
  setMessages(prev => prev.map(msg =>
    msg.meta?.toolId === toolId
      ? { ...msg, content: `${success ? '✅' : '❌'} ${msg.content}` }
      : msg
  ));
}
```

### Phase 5: Enhanced Status Line

**Replace hardcoded statuses** with dynamic ones from backend:

```typescript
// BEFORE (hardcoded):
setStreamingState(`Thinking ${elapsed}s · ESC to interrupt`, true);
setStreamingState(`Responding · ESC to interrupt`, true);

// AFTER (driven by backend plan events):
// Just show what backend sends:
if (event.event === 'plan') {
  const message = event.data?.message || 'Working';
  setStreamingState(`${message} · ESC to interrupt`, true);
}

// Keep timer for thinking mode as fallback:
if (!event.event && sessionState.isSending && !sessionState.lastPlanMessage) {
  setStreamingState(`Thinking ${elapsed}s · ESC to interrupt`, true);
}
```

---

## 5. Priority Recommendations

### 🔴 Critical (Do First)

1. **Backend: Emit `plan` events** for every significant action
   - File reads: "Reading X"
   - Tool calls: "Running Bash: command"
   - Analysis phases: "Analyzing code", "Searching codebase"
   - Write operations: "Writing to file X"

2. **Frontend: Remove hardcoded status messages**
   - Delete "Thinking Xs", "Responding" hardcoded text
   - Trust backend `plan` events exclusively

### 🟡 High Priority (Do Soon)

3. **Frontend: Parse thinking blocks**
   - Extract `<thinking>` content from deltas
   - Display in collapsible component
   - Style differently from regular content

4. **Frontend: Tool execution visibility**
   - Show inline "🔧 Running X" messages
   - Update to "✅ Completed" or "❌ Failed"

### 🟢 Nice to Have (Later)

5. **Real-time metrics panel**
   - Token counter (live update)
   - Elapsed time
   - Cost estimate

6. **Execution timeline view**
   - Visual timeline of actions
   - Clickable steps
   - Collapse/expand each phase

---

## 6. Code Locations Summary

### Backend Changes Needed

- **Job event emitter** - Add `plan` event emissions before:
  - File reads
  - Tool executions
  - Analysis phases
  - Write operations
  - Compaction (already works)

### Frontend Changes

| File | Line | Change |
|------|------|--------|
| `Panel.tsx` | 3847-3889 | Remove hardcoded "Thinking", "Responding" |
| `Panel.tsx` | 4614-4633 | Already handles `plan` events ✅ |
| `Panel.tsx` | 4588-4612 | Add thinking block parsing |
| `Panel.tsx` | 4651-4700 | Add tool execution indicators |
| `ThinkingBlock.tsx` | (new) | Create collapsible thinking component |
| `panel.css` | (append) | Add thinking block styles |

---

## 7. Example: Expected Flow

### User Action
```
User: "Fix the bug in authentication.ts"
```

### Backend Events (what should be emitted)
```json
{"event": "plan", "data": {"message": "Analyzing authentication.ts"}}
{"event": "plan", "data": {"message": "Reading authentication.ts"}}
{"event": "delta", "data": {"text": "<thinking>User wants to fix auth bug. Need to read file first...</thinking>"}}
{"event": "plan", "data": {"message": "Searching codebase for similar patterns"}}
{"event": "plan", "data": {"message": "Running Bash: grep -r 'authenticate' src/"}}
{"event": "tool_result", "data": {...}}
{"event": "plan", "data": {"message": "Writing fix to authentication.ts"}}
{"event": "delta", "data": {"text": "I found the issue in the JWT validation..."}}
{"event": "done"}
```

### Frontend Display
```
[Status bar] Analyzing authentication.ts · ESC to interrupt

[Thinking Block - Collapsed]
🧠 Chain of Thought ›

[Status bar] Reading authentication.ts · ESC to interrupt

[Status bar] Searching codebase for similar patterns · ESC to interrupt

[System Message]
🔧 Running Bash: grep -r 'authenticate' src/
✅ Bash completed (exit 0)

[Status bar] Writing fix to authentication.ts · ESC to interrupt

[Assistant Message]
I found the issue in the JWT validation. The problem is...
```

---

## 8. Conclusion

**Root Cause:** Ageaf's frontend is already prepared for rich CoT display. The gap is the backend not emitting enough detailed `plan` events.

**Solution:** Backend should emit `plan` events for EVERY significant action, not just compaction. Frontend already displays them via the streaming status line (line 4614-4633).

**Quick Win:** Start with backend changes to emit more `plan` events. This will immediately improve the user experience without any frontend changes.

**Long-term:** Add thinking block separation and tool execution indicators for a polished, Cursor-like experience.
