const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// ─── Portable replicas of Panel.tsx logic for behavioral testing ────────

function completeLastTool(cot) {
  const last = cot[cot.length - 1];
  if (last && last.type === 'tool' && last.phase === 'started') {
    last.phase = 'completed';
    last.completedAt = Date.now();
    return true;
  }
  return false;
}

function mergeToolUpdate(currentCoT, toolId, toolName, toolInput, description) {
  // Primary: match by toolId
  let target = toolId
    ? currentCoT.find((item) => item.type === 'tool' && item.toolId === toolId)
    : undefined;

  // Fallback: last started tool with same name and no input
  if (!target && toolName) {
    for (let i = currentCoT.length - 1; i >= 0; i--) {
      const item = currentCoT[i];
      if (item.type === 'tool' && item.toolName === toolName && item.phase === 'started' && !item.input) {
        target = item;
        break;
      }
    }
  }

  if (target) {
    if (toolInput && !target.input) target.input = toolInput;
    if (description && !target.description) target.description = description;
  }

  return target;
}

function formatToolContext(toolName, input, description) {
  if (!input && !description) return null;
  if ((toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') && input) {
    const parts = input.split('/');
    return parts[parts.length - 1] || input;
  }
  if (toolName === 'Bash' && description) return description;
  if (toolName === 'Agent' && input) return input;
  const text = input || description || '';
  return text.length > 40 ? text.slice(0, 40) + '...' : text;
}

// ─── Source-assertion: Panel.tsx has tool_update handling ────────────

const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');

test('Panel.tsx handles tool_update phase', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /isToolUpdatePhase/);
  assert.match(contents, /tool_update/);
});

test('Panel.tsx sets startedAt on tool_start', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /startedAt:\s*Date\.now\(\)/);
});

test('Panel.tsx sets completedAt on completeLastTool', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /last\.completedAt\s*=\s*Date\.now\(\)/);
});

test('Panel.tsx sets completedAt on tool_complete/tool_error', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /existingCoTTool\.completedAt\s*=\s*Date\.now\(\)/);
});

test('Panel.tsx has ElapsedTimer component', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /const ElapsedTimer/);
});

test('Panel.tsx has formatToolContext helper', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /function formatToolContext/);
});

test('Panel.tsx has expandedToolItems state', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /expandedToolItems/);
});

// ─── Behavioral tests for mergeToolUpdate ───────────────────────────

test('tool_update with matching toolId merges input and description', () => {
  const cot = [
    { type: 'tool', toolId: 'abc', toolName: 'Read', phase: 'started' },
  ];
  const target = mergeToolUpdate(cot, 'abc', 'Read', '/src/file.ts', undefined);
  assert.ok(target);
  assert.equal(target.input, '/src/file.ts');
});

test('tool_update with unknown toolId falls back to last started tool', () => {
  const cot = [
    { type: 'tool', toolId: 'old', toolName: 'Read', phase: 'started' },
  ];
  const target = mergeToolUpdate(cot, 'nonexistent', 'Read', '/path.ts', 'desc');
  // Falls back because toolId doesn't match, but toolName does
  assert.ok(target);
  assert.equal(target.input, '/path.ts');
  assert.equal(target.description, 'desc');
});

test('tool_update with no matching tool is a no-op', () => {
  const cot = [
    { type: 'tool', toolId: 'abc', toolName: 'Write', phase: 'completed' },
  ];
  const target = mergeToolUpdate(cot, 'nonexistent', 'Read', '/path.ts', undefined);
  assert.equal(target, undefined);
});

test('tool_update does not overwrite existing input', () => {
  const cot = [
    { type: 'tool', toolId: 'abc', toolName: 'Read', phase: 'started', input: '/existing.ts' },
  ];
  const target = mergeToolUpdate(cot, 'abc', 'Read', '/new.ts', undefined);
  assert.ok(target);
  assert.equal(target.input, '/existing.ts');
});

test('tool_update does not overwrite existing description', () => {
  const cot = [
    { type: 'tool', toolId: 'abc', toolName: 'Bash', phase: 'started', description: 'existing' },
  ];
  const target = mergeToolUpdate(cot, 'abc', 'Bash', undefined, 'new desc');
  assert.ok(target);
  assert.equal(target.description, 'existing');
});

// ─── Behavioral tests for completeLastTool ──────────────────────────

test('completeLastTool sets completedAt on the completed item', () => {
  const cot = [
    { type: 'tool', toolId: 'abc', toolName: 'Read', phase: 'started', startedAt: Date.now() - 5000 },
  ];
  const result = completeLastTool(cot);
  assert.equal(result, true);
  assert.equal(cot[0].phase, 'completed');
  assert.ok(typeof cot[0].completedAt === 'number');
});

test('completeLastTool returns false if last item is not a started tool', () => {
  const cot = [
    { type: 'tool', toolId: 'abc', toolName: 'Read', phase: 'completed' },
  ];
  assert.equal(completeLastTool(cot), false);
});

// ─── Behavioral tests for formatToolContext ─────────────────────────

test('formatToolContext returns basename for Read tool', () => {
  assert.equal(formatToolContext('Read', '/path/to/file.ts'), 'file.ts');
});

test('formatToolContext returns description for Bash', () => {
  assert.equal(formatToolContext('Bash', 'npm test', 'Run tests'), 'Run tests');
});

test('formatToolContext returns input for Agent', () => {
  assert.equal(formatToolContext('Agent', 'explore codebase'), 'explore codebase');
});

test('formatToolContext returns null when no input or description', () => {
  assert.equal(formatToolContext('Read'), null);
});

test('formatToolContext truncates long strings', () => {
  const long = 'a'.repeat(50);
  const result = formatToolContext('Grep', long);
  assert.equal(result.length, 43); // 40 + '...'
});

// ─── Backward compat: old items without new fields render safely ────

test('chatStore normalizeCoTItem with old items (no startedAt/completedAt/description)', () => {
  const chatStorePath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'chatStore.ts');
  const contents = fs.readFileSync(chatStorePath, 'utf8');
  // Verify new fields are optional in type definition
  assert.match(contents, /description\?\:\s*string/);
  assert.match(contents, /startedAt\?\:\s*number/);
  assert.match(contents, /completedAt\?\:\s*number/);
  // Verify normalizeCoTItem handles missing fields gracefully
  assert.match(contents, /typeof raw\.description === 'string'/);
  assert.match(contents, /typeof raw\.startedAt === 'number'/);
  assert.match(contents, /typeof raw\.completedAt === 'number'/);
});

// ─── PI dedup: must match by toolCallId, not toolName ───────────────

test('PI dedup source: tool_execution_start matches by toolCallId not toolName', () => {
  const piAgentPath = path.join(__dirname, '..', 'host', 'src', 'runtimes', 'pi', 'agent.ts');
  const contents = fs.readFileSync(piAgentPath, 'utf8');
  // Must match by toolId (from toolCallId), not by toolName
  assert.match(contents, /e\.toolId === execToolCallId/);
  // Must NOT match by toolName in the dedup path
  assert.doesNotMatch(contents, /findIndex\(e\s*=>\s*e\.toolName\s*===\s*event\.toolName\)/);
});

// ─── Behavioral: PI dedup by toolCallId handles same-name tools correctly ──

function simulatePiDedup(events) {
  const piPendingToolCalls = [];
  const emitted = [];

  for (const ev of events) {
    if (ev.type === 'toolcall_start') {
      piPendingToolCalls.push({ toolName: ev.toolName, toolId: ev.toolId });
      emitted.push({ phase: 'tool_start', toolId: ev.toolId, toolName: ev.toolName });
    } else if (ev.type === 'tool_execution_start') {
      const idx = ev.toolCallId
        ? piPendingToolCalls.findIndex(e => e.toolId === ev.toolCallId)
        : -1;
      if (idx >= 0) {
        piPendingToolCalls.splice(idx, 1);
        // Deduped — skip
      } else {
        const syntheticId = ev.toolCallId || 'pi-synthetic';
        emitted.push({ phase: 'tool_start', toolId: syntheticId, toolName: ev.toolName });
      }
    }
  }
  return { emitted, pending: piPendingToolCalls };
}

test('PI dedup: two same-name Read calls get separate tool_start events', () => {
  const { emitted } = simulatePiDedup([
    { type: 'toolcall_start', toolName: 'Read', toolId: 'call_1' },
    { type: 'toolcall_start', toolName: 'Read', toolId: 'call_2' },
    { type: 'tool_execution_start', toolName: 'Read', toolCallId: 'call_1' },
    { type: 'tool_execution_start', toolName: 'Read', toolCallId: 'call_2' },
  ]);

  // Should have exactly 2 tool_start events (from toolcall_start), not 4
  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].toolId, 'call_1');
  assert.equal(emitted[1].toolId, 'call_2');
});

test('PI dedup: toolCallId mismatch does NOT pop wrong queue entry', () => {
  const { emitted } = simulatePiDedup([
    { type: 'toolcall_start', toolName: 'Read', toolId: 'call_A' },
    { type: 'toolcall_start', toolName: 'Read', toolId: 'call_B' },
    // tool_execution_start arrives for call_B first (out of order)
    { type: 'tool_execution_start', toolName: 'Read', toolCallId: 'call_B' },
    { type: 'tool_execution_start', toolName: 'Read', toolCallId: 'call_A' },
  ]);

  // Still exactly 2 events: the two from toolcall_start
  assert.equal(emitted.length, 2);
});

test('PI dedup: tool_execution_start without prior toolcall_start emits fallback', () => {
  const { emitted } = simulatePiDedup([
    { type: 'tool_execution_start', toolName: 'Read', toolCallId: 'orphan_1' },
  ]);

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].toolId, 'orphan_1');
  assert.equal(emitted[0].toolName, 'Read');
});

// ─── Claude: content_block_start with pre-populated input ───────────

test('Claude runtime: content_block_start.input extraction exists', () => {
  const claudeAgentPath = path.join(__dirname, '..', 'host', 'src', 'runtimes', 'claude', 'agent.ts');
  const contents = fs.readFileSync(claudeAgentPath, 'utf8');
  // Must read toolInput from content_block_start
  assert.match(contents, /content_block\?\.input/);
  // Must call extractToolDisplayInfo on start input
  assert.match(contents, /extractToolDisplayInfo\(toolName,\s*toolInput/);
  // Must track hadStartInput to avoid redundant tool_update
  assert.match(contents, /hadStartInput/);
});
