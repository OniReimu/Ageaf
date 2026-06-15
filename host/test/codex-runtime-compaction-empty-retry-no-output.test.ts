import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex runtime fails clearly when compaction flow returns empty output', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-compaction-empty-retry-no-output');
  const events: JobEvent[] = [];
  const previousCompletionGrace = process.env.AGEAF_CODEX_COMPLETION_GRACE_MS;
  process.env.AGEAF_CODEX_COMPLETION_GRACE_MS = '50';

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
    assert.equal(output, '', 'expected no assistant output');

    const done = events.find((event) => event.event === 'done');
    assert.ok(done, 'expected done event');
    assert.equal((done?.data as any)?.status, 'error');
    assert.match(
      String((done?.data as any)?.message ?? ''),
      /returned no output/i
    );
  } finally {
    if (previousCompletionGrace === undefined) {
      delete process.env.AGEAF_CODEX_COMPLETION_GRACE_MS;
    } else {
      process.env.AGEAF_CODEX_COMPLETION_GRACE_MS = previousCompletionGrace;
    }
    await resetCodexAppServerForTests();
  }
});
