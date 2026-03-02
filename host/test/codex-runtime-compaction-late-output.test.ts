import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex runtime preserves late assistant output that arrives just after compaction completion', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-compaction-late-output');
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

    const output = events
      .filter((event) => event.event === 'delta')
      .map((event) => String((event.data as any)?.text ?? ''))
      .join('');
    assert.equal(output, 'Recovered after compaction (late payload)');

    const done = events.find((event) => event.event === 'done');
    assert.ok(done, 'expected done event');
    assert.equal((done?.data as any)?.status, 'ok');
  } finally {
    await resetCodexAppServerForTests();
  }
});
