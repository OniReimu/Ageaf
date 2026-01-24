import assert from 'node:assert/strict';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';

test('Claude runtime reports not_configured when missing auth', async () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  const previousClaude = process.env.CLAUDE_CODE_AVAILABLE;
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  const previousDetect = process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_CODE_AVAILABLE;
  delete process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT = 'true';

  try {
    const { runClaudeJob } = await import('../src/runtimes/claude/run.js');
    const events: JobEvent[] = [];

    await runClaudeJob({ action: 'chat' }, (event) => {
      events.push(event);
    });

    const last = events[events.length - 1];
    assert.equal(last.event, 'done');
    assert.deepEqual(last.data, {
      status: 'not_configured',
      message: 'Claude Code is not configured. Open a terminal, log in, then retry.',
    });
  } finally {
    if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousApiKey;
    if (previousClaude === undefined) delete process.env.CLAUDE_CODE_AVAILABLE;
    else process.env.CLAUDE_CODE_AVAILABLE = previousClaude;
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    if (previousDetect === undefined) delete process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT;
    else process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT = previousDetect;
  }
});
