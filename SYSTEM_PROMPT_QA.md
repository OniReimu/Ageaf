# System Prompt Q&A

## Question 1: Does this also apply to Anthropic provider?

**Answer: YES! ✅ I've now updated BOTH providers.**

Ageaf has two separate runtimes that both needed updating:

### 1. **Codex Runtime** ✅ (Already Updated)
**File**: `host/src/runtimes/codex/run.ts`

This is used when the provider is set to Codex.

### 2. **Claude/Anthropic Runtime** ✅ (Just Updated)
**File**: `host/src/runtimes/claude/run.ts`

This is used when the provider is set to Anthropic/Claude API.

### What Was Updated:

Both runtimes now have the same refined system prompt with:

1. **Enhanced Patch Guidance**:
   - MANDATORY use of `ageaf-patch` review change card when:
     - User has selected/quoted/highlighted text AND
     - User uses editing keywords (proofread, paraphrase, rewrite, rephrase, refine, improve)

2. **Selection Patch Guidance** (NEW):
   - CRITICAL section that enforces review change card for selected text + editing keywords
   - Applies whether user clicked button OR typed message
   - Exception handling for opt-out

3. **Humanizer Integration**:
   - Instructions to use `/humanizer` skill for natural writing
   - Removes AI patterns automatically

### Code Changes Made:

**File**: `host/src/runtimes/claude/run.ts` (lines 208-237)

```typescript
const hasSelection = contextForPrompt &&
  typeof contextForPrompt.selection === 'string' &&
  contextForPrompt.selection.trim().length > 0;

const patchGuidance = [
  'Patch proposals (Review Change Cards):',
  '- Use an `ageaf-patch` block when the user wants to modify existing Overleaf content...',
  '- IMPORTANT: If the user has selected/quoted/highlighted text AND uses editing keywords...',
  '  you MUST use an `ageaf-patch` review change card instead of a normal fenced code block.',
  // ... (same as Codex)
].join('\n');

const selectionPatchGuidance = hasSelection
  ? [
    '\nSelection edits (CRITICAL - Review Change Card):',
    '- If `Context.selection` is present AND the user uses words like "proofread"...',
    '  you MUST emit an `ageaf-patch` review change card...',
    // ... (same as Codex)
  ].join('\n')
  : '';

const baseParts = [
  'You are Ageaf, a concise Overleaf assistant.',
  responseGuidance,
  patchGuidance,
  selectionPatchGuidance,  // ← ADDED THIS
  // ...
];
```

---

## Question 2: Where does the Customized prompt from settings page go?

**Answer: It's appended at the END of the system prompt! ✅**

### Location in Settings UI:

**Panel**: Settings → General tab
**Field**: "Custom system prompt"
**Placeholder**: "Additional instructions appended to the default system prompt..."

**Code Reference**: `src/iso/panel/Panel.tsx` (line 7031-7046)

### How It's Used:

#### In Codex Runtime (`host/src/runtimes/codex/run.ts`):

```typescript
function buildPrompt(payload: CodexJobPayload, contextForPrompt: Record<string, unknown> | null) {
  // ...
  const custom = payload.userSettings?.customSystemPrompt?.trim();  // ← Read from settings

  const baseParts = [
    'You are Ageaf, a concise Overleaf assistant.',
    'Respond in Markdown, keep it concise.',
    action === 'chat' ? patchGuidance : '',
    action === 'chat' ? selectionPatchGuidance : '',
    `Action: ${action}`,
    contextForPrompt ? `Context:\n${JSON.stringify(contextForPrompt, null, 2)}` : '',
    action === 'rewrite' ? rewriteInstructions : '',
    hasOverleafFileBlocks ? fileUpdateInstructions : '',
  ].filter(Boolean);

  if (custom) {
    baseParts.push(`\nAdditional instructions:\n${custom}`);  // ← Appended here
  }

  return baseParts.join('\n\n');  // ← Final prompt
}
```

**Lines**: 465, 548-550

#### In Claude/Anthropic Runtime (`host/src/runtimes/claude/run.ts`):

```typescript
const customSystemPrompt = payload.userSettings?.customSystemPrompt?.trim();  // ← Read from settings

const baseParts = [
  'You are Ageaf, a concise Overleaf assistant.',
  responseGuidance,
  patchGuidance,
  selectionPatchGuidance,
  hasOverleafFileBlocks ? fileUpdateGuidance : '',
  greetingMode ? greetingGuidance : 'If the user message is not a greeting, respond normally but stay concise.',
];

if (customSystemPrompt) {
  baseParts.push(`\nAdditional instructions:\n${customSystemPrompt}`);  // ← Appended here
}

const basePrompt = baseParts.join('\n\n');  // ← Final prompt
```

**Lines**: 195, 245-249

---

## Complete System Prompt Order (After All Updates)

### For Codex Runtime:

```
1. You are Ageaf, a concise Overleaf assistant.
2. Respond in Markdown, keep it concise.

3. [If action === 'chat']
   Patch proposals (Review Change Cards):
   - Use an `ageaf-patch` block when...
   - IMPORTANT: If user has selected text AND uses editing keywords...
   - Exception: Only skip if user says "no review card"...

4. [If action === 'chat' AND hasSelection]
   Selection edits (CRITICAL - Review Change Card):
   - If `Context.selection` is present AND user uses words like "proofread"...
   - You MUST emit an `ageaf-patch` review change card...
   - Do NOT just output a normal fenced code block...

5. Action: chat (or rewrite)

6. Context:
   {
     "selection": "...",
     "message": "...",
     ...
   }

7. [If action === 'rewrite']
   You are rewriting a selected LaTeX region from Overleaf.
   Preserve LaTeX commands, citations...
   IMPORTANT: When rewriting/editing text, the /humanizer skill should be automatically invoked...

8. [If hasOverleafFileBlocks]
   Overleaf file edits:
   - The user may include one or more `[Overleaf file: <path>]` blocks...

9. [If custom prompt exists] ← YOUR CUSTOM PROMPT GOES HERE
   Additional instructions:
   [Your custom instructions from settings]
```

### For Claude/Anthropic Runtime:

```
1. You are Ageaf, a concise Overleaf assistant.

2. Response style:
   - Respond in Markdown by default...
   - Keep responses concise...

3. Patch proposals (Review Change Cards):
   - Use an `ageaf-patch` block when...
   - IMPORTANT: If user has selected text AND uses editing keywords...

4. [If hasSelection]
   Selection edits (CRITICAL - Review Change Card):
   - If `Context.selection` is present AND user uses words like "proofread"...
   - You MUST emit an `ageaf-patch` review change card...

5. [If hasOverleafFileBlocks]
   Overleaf file edits:
   - The user may include one or more `[Overleaf file: <path>]` blocks...

6. [If greetingMode]
   Greeting behavior:
   - If the user message is a short greeting...
   [ELSE]
   If the user message is not a greeting, respond normally but stay concise.

7. [If custom prompt exists] ← YOUR CUSTOM PROMPT GOES HERE
   Additional instructions:
   [Your custom instructions from settings]

8. Runtime note: This request is executed via [Claude Code CLI / Anthropic API]...
   Model setting: [model info]...

9. Action: [action type]

10. Context:
    {
      "selection": "...",
      "message": "...",
      ...
    }
```

---

## Example: Complete Prompt with Custom Instructions

### User Settings:
**Custom System Prompt**: "Always use British English spelling. Keep responses under 3 sentences when possible."

### Codex Runtime - Final Prompt:

```
You are Ageaf, a concise Overleaf assistant.
Respond in Markdown, keep it concise.

Patch proposals (Review Change Cards):
- Use an `ageaf-patch` block when the user wants to modify existing Overleaf content...
- IMPORTANT: If the user has selected/quoted/highlighted text AND uses editing keywords...
[... full patch guidance ...]

Selection edits (CRITICAL - Review Change Card):
- If `Context.selection` is present AND the user uses words like "proofread"...
[... full selection guidance ...]

Action: chat

Context:
{
  "selection": "The colour of the solution was measured...",
  "message": "Please improve this sentence"
}

Additional instructions:
Always use British English spelling. Keep responses under 3 sentences when possible.
```

### What Happens:
1. System detects `Context.selection` is present
2. System detects keyword "improve"
3. System applies ALL guidance:
   - Use `ageaf-patch` review change card (from refined prompt)
   - Use `/humanizer` skill (from refined prompt)
   - Use British English (from custom prompt)
   - Keep response under 3 sentences (from custom prompt)

---

## Testing Custom Prompt

To verify your custom prompt is being used:

1. Go to Settings → General tab
2. Add custom instructions, e.g.: "Always end responses with 🎯"
3. Save settings
4. Ask Ageaf any question
5. Check if the response ends with 🎯

If it does, your custom prompt is working! ✅

---

## Key Takeaways

1. ✅ **Both Codex AND Anthropic runtimes** now have the refined system prompt
2. ✅ **Custom prompt from settings** is appended at the END of the system prompt
3. ✅ **Custom prompt works for BOTH runtimes** (Codex and Claude/Anthropic)
4. ✅ The order is: Base prompt → Patch guidance → Selection guidance → Context → **Your custom instructions**

---

## Files Updated

1. **`host/src/runtimes/codex/run.ts`** (lines 495-522, 548-550)
   - Enhanced patch guidance
   - Added selection patch guidance
   - Custom prompt appending (already existed)

2. **`host/src/runtimes/claude/run.ts`** (lines 208-237, 245-249)
   - Enhanced patch guidance (NEW)
   - Added selection patch guidance (NEW)
   - Custom prompt appending (already existed)

3. **`SYSTEM_PROMPT_QA.md`** (this file)
   - Complete documentation of both runtimes
   - Custom prompt explanation
   - Examples and testing instructions
