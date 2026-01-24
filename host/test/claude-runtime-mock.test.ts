import assert from 'node:assert/strict';
import test from 'node:test';

import type { JobEvent, Patch } from '../src/types.js';

test('Claude runtime mock emits patch event', async () => {
  const previousRuntime = process.env.CLAUDE_CODE_AVAILABLE;
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.CLAUDE_CODE_AVAILABLE = 'true';
  process.env.AGEAF_CLAUDE_MOCK = 'true';

  try {
    const { runClaudeStructuredPatch } = await import('../src/runtimes/claude/agent.js');
    const events: JobEvent[] = [];

    const patch: Patch = { kind: 'replaceSelection', text: 'Fixed output' };
    await runClaudeStructuredPatch({
      prompt: 'Rewrite selection',
      fallbackPatch: patch,
      emitEvent: (event) => events.push(event),
    });

    const patchEvent = events.find((event) => event.event === 'patch');
    assert.ok(patchEvent);
    assert.deepEqual(patchEvent?.data, patch);
  } finally {
    if (previousRuntime === undefined) delete process.env.CLAUDE_CODE_AVAILABLE;
    else process.env.CLAUDE_CODE_AVAILABLE = previousRuntime;
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
  }
});
