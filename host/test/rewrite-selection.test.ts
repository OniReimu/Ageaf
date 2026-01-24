import assert from 'node:assert/strict';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';

test('Rewrite selection emits replaceSelection patch when configured', async () => {
  const previousRuntime = process.env.CLAUDE_CODE_AVAILABLE;
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.CLAUDE_CODE_AVAILABLE = 'true';
  process.env.AGEAF_CLAUDE_MOCK = 'true';

  try {
    const { runRewriteSelection } = await import('../src/workflows/rewriteSelection.js');
    const events: JobEvent[] = [];

    await runRewriteSelection(
      {
        context: {
          selection: 'Intro text.',
        },
      },
      (event) => {
        events.push(event);
      }
    );

    const patchEvent = events.find((event) => event.event === 'patch');
    assert.ok(patchEvent);
    assert.deepEqual(patchEvent?.data, {
      kind: 'replaceSelection',
      text: 'Intro text.',
    });
  } finally {
    if (previousRuntime === undefined) delete process.env.CLAUDE_CODE_AVAILABLE;
    else process.env.CLAUDE_CODE_AVAILABLE = previousRuntime;
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
  }
});
