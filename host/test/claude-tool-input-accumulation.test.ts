import assert from 'node:assert/strict';
import test from 'node:test';
import { extractToolDisplayInfo } from '../src/toolDisplayInfo.js';

/**
 * Simulates the content_block_start → input_json_delta × N → content_block_stop
 * lifecycle used by the Claude runtime for tool input accumulation.
 *
 * We test the accumulation logic as a standalone unit — the actual runtime wires
 * this into the stream event loop. See host/src/runtimes/claude/agent.ts.
 */

type PendingEntry = {
  toolId: string;
  toolName: string;
  chunks: string[];
  hadStartInput: boolean;
};

// Minimal simulation of the Claude runtime accumulation logic
function simulateAccumulation(events: Array<{
  type: string;
  index?: number;
  content_block?: { type: string; name?: string; id?: string; input?: Record<string, unknown> };
  delta?: { type: string; partial_json?: string };
}>) {
  const pendingToolInputs = new Map<number, PendingEntry>();
  const emitted: Array<{ phase: string; toolId?: string; toolName?: string; input?: string; description?: string }> = [];

  for (const event of events) {
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const toolName = event.content_block.name ?? 'unknown';
      const toolId = event.content_block.id ?? 'test-id';
      const toolInput = event.content_block.input;

      let startDisplay: { input?: string; description?: string } = {};
      if (typeof toolInput === 'object' && toolInput !== null && Object.keys(toolInput).length > 0) {
        startDisplay = extractToolDisplayInfo(toolName, toolInput);
      }

      emitted.push({
        phase: 'tool_start',
        toolId,
        toolName,
        ...(startDisplay.input ? { input: startDisplay.input } : {}),
        ...(startDisplay.description ? { description: startDisplay.description } : {}),
      });

      if (typeof event.index === 'number') {
        pendingToolInputs.set(event.index, {
          toolId,
          toolName,
          chunks: [],
          hadStartInput: !!(startDisplay.input || startDisplay.description),
        });
      }
    }

    if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
      const entry = pendingToolInputs.get(event.index!);
      if (entry) entry.chunks.push(event.delta.partial_json ?? '');
    }

    if (event.type === 'content_block_stop') {
      const entry = pendingToolInputs.get(event.index!);
      if (entry) {
        pendingToolInputs.delete(event.index!);
        if (entry.chunks.length > 0) {
          try {
            const parsed = JSON.parse(entry.chunks.join(''));
            const display = extractToolDisplayInfo(entry.toolName, parsed);
            if ((display.input || display.description) && !entry.hadStartInput) {
              emitted.push({
                phase: 'tool_update',
                toolId: entry.toolId,
                toolName: entry.toolName,
                ...display,
              });
            }
          } catch { /* malformed — skip */ }
        }
      }
    }
  }

  return { emitted, pendingToolInputs };
}

test('Normal flow: tool_start emitted immediately, tool_update after stop with parsed input', () => {
  const { emitted, pendingToolInputs } = simulateAccumulation([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'Read', id: 'toolu_1', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"file_' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'path":"/src/app.ts"}' } },
    { type: 'content_block_stop', index: 0 },
  ]);

  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].phase, 'tool_start');
  assert.equal(emitted[0].input, undefined); // no input at start
  assert.equal(emitted[1].phase, 'tool_update');
  assert.equal(emitted[1].input, '/src/app.ts');
  assert.equal(pendingToolInputs.size, 0, 'map should be empty after stop');
});

test('content_block_start already has input → tool_start includes it, no redundant tool_update', () => {
  const { emitted } = simulateAccumulation([
    { type: 'content_block_start', index: 0, content_block: {
      type: 'tool_use', name: 'Read', id: 'toolu_2',
      input: { file_path: '/already/here.ts' },
    }},
    // Delta still arrives (some APIs do this) but should not produce redundant update
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"file_path":"/already/here.ts"}' } },
    { type: 'content_block_stop', index: 0 },
  ]);

  assert.equal(emitted.length, 1, 'only tool_start, no redundant tool_update');
  assert.equal(emitted[0].phase, 'tool_start');
  assert.equal(emitted[0].input, '/already/here.ts');
});

test('Malformed delta JSON → no tool_update, map still cleaned up', () => {
  const { emitted, pendingToolInputs } = simulateAccumulation([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'Bash', id: 'toolu_3', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"command": "npm ' } },
    // Stream interrupted — no closing brace
    { type: 'content_block_stop', index: 0 },
  ]);

  assert.equal(emitted.length, 1, 'only tool_start, malformed delta skipped');
  assert.equal(emitted[0].phase, 'tool_start');
  assert.equal(pendingToolInputs.size, 0, 'map cleaned up despite parse failure');
});

test('No deltas at all → no tool_update emitted', () => {
  const { emitted, pendingToolInputs } = simulateAccumulation([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'Grep', id: 'toolu_4', input: {} } },
    { type: 'content_block_stop', index: 0 },
  ]);

  assert.equal(emitted.length, 1, 'only tool_start');
  assert.equal(pendingToolInputs.size, 0);
});

test('Multiple concurrent tool blocks accumulate independently', () => {
  const { emitted, pendingToolInputs } = simulateAccumulation([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'Read', id: 'toolu_a', input: {} } },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', name: 'Read', id: 'toolu_b', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"file_path":"/a.ts"}' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_path":"/b.ts"}' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_stop', index: 1 },
  ]);

  assert.equal(emitted.length, 4); // 2 starts + 2 updates
  const updates = emitted.filter(e => e.phase === 'tool_update');
  assert.equal(updates.length, 2);
  assert.equal(updates[0].toolId, 'toolu_a');
  assert.equal(updates[0].input, '/a.ts');
  assert.equal(updates[1].toolId, 'toolu_b');
  assert.equal(updates[1].input, '/b.ts');
  assert.equal(pendingToolInputs.size, 0);
});
