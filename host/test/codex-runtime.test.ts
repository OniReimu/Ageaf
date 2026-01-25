import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex runtime streams deltas and usage', async () => {
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
          },
        },
      },
      (event) => events.push(event)
    );

    const deltas = events.filter((event) => event.event === 'delta');
    assert.ok(deltas.length > 0, 'expected delta events');
    assert.equal(
      deltas.map((event) => String((event.data as any)?.text ?? '')).join(''),
      'Hello from Codex [model=null effort=null]'
    );

    const usage = events.find((event) => event.event === 'usage');
    assert.ok(usage, 'expected usage event');
    assert.equal((usage?.data as any)?.usedTokens, 22);
    assert.equal((usage?.data as any)?.contextWindow, 200000);

    const done = events.find((event) => event.event === 'done');
    assert.ok(done, 'expected done event');
    assert.equal((done?.data as any)?.status, 'ok');
    assert.equal(typeof (done?.data as any)?.threadId, 'string');
  } finally {
    await resetCodexAppServerForTests();
  }
});
