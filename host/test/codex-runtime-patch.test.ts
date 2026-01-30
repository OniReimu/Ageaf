import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex runtime emits patch events from ageaf-patch fences', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-patch');
  const events: JobEvent[] = [];

  try {
    await runCodexJob(
      {
        action: 'rewrite',
        context: { message: 'Rewrite selection', selection: 'old' },
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

    const deltaText = events
      .filter((event) => event.event === 'delta')
      .map((event) => String((event.data as any)?.text ?? ''))
      .join('');

    assert.match(deltaText, /Proposed change/i);
    assert.ok(!/ageaf[-_]?patch/i.test(deltaText), 'should not stream patch fences');

    const patchEvent = events.find((event) => event.event === 'patch');
    assert.ok(patchEvent, 'expected patch event');
    assert.deepEqual(patchEvent?.data, { kind: 'replaceSelection', text: 'NEW TEXT' });

    const done = events.find((event) => event.event === 'done');
    assert.ok(done, 'expected done event');
    assert.equal((done?.data as any)?.status, 'ok');
  } finally {
    await resetCodexAppServerForTests();
  }
});

