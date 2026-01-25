import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex runtime resumes an existing thread when threadId is provided', async () => {
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
            threadId: 'thread-resume',
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

    const done = events.find((event) => event.event === 'done');
    assert.ok(done, 'expected done event');
    assert.equal((done?.data as any)?.status, 'ok');
    assert.equal((done?.data as any)?.threadId, 'thread-resume');
  } finally {
    await resetCodexAppServerForTests();
  }
});
