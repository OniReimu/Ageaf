import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex rewrite emits patch from rewrite markers', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-rewrite-markers');
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

    assert.match(deltaText, /Change notes/i);
    assert.doesNotMatch(deltaText, /AGEAF_REWRITE/);
    assert.doesNotMatch(deltaText, /NEW LINE 1/);

    const patchEvent = events.find((event) => event.event === 'patch');
    assert.ok(patchEvent, 'expected patch event');
    assert.deepEqual(patchEvent?.data, {
      kind: 'replaceSelection',
      text: 'NEW LINE 1\nNEW LINE 2',
    });
  } finally {
    await resetCodexAppServerForTests();
  }
});

