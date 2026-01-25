import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex runtime forwards model and reasoning effort when provided', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex');
  const events: JobEvent[] = [];

  try {
    await runCodexJob(
      {
        action: 'chat',
        context: { message: 'Hello' },
        runtime: {
          codex: {
            cliPath,
            envVars: '',
            approvalPolicy: 'on-request',
            model: 'gpt-5.2',
            reasoningEffort: 'xhigh',
          } as any,
        },
      },
      (event) => events.push(event)
    );

    const deltas = events.filter((event) => event.event === 'delta');
    assert.ok(deltas.length > 0, 'expected delta events');
    assert.equal(
      deltas.map((event) => String((event.data as any)?.text ?? '')).join(''),
      'Hello from Codex [model=gpt-5.2 effort=xhigh]'
    );
  } finally {
    await resetCodexAppServerForTests();
  }
});

