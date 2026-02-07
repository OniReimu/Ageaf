import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex chat emits replaceRangeInFile patch from file update markers', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-file-update');
  const events: JobEvent[] = [];

  const oldFile = 'Hello world\n';
  const message = [
    'Proofread this file:',
    '',
    '[Overleaf file: main.tex]',
    '```tex',
    oldFile.trimEnd(),
    '```',
    '',
  ].join('\n');

  try {
    await runCodexJob(
      {
        action: 'chat',
        context: { message },
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
    assert.doesNotMatch(deltaText, /AGEAF_FILE_UPDATE/i);
    assert.doesNotMatch(deltaText, /Hello there/);

    const patchIndex = events.findIndex((event) => event.event === 'patch');
    const doneIndex = events.findIndex((event) => event.event === 'done');
    assert.ok(patchIndex >= 0, 'expected patch event');
    assert.ok(doneIndex >= 0, 'expected done event');
    assert.ok(patchIndex < doneIndex, 'patch should arrive before done');

    const patchEvent = events[patchIndex];
    assert.deepEqual(patchEvent?.data, {
      kind: 'replaceRangeInFile',
      filePath: 'main.tex',
      expectedOldText: 'Hello world',
      text: 'Hello there',
      from: 0,
      to: 11,
    });
  } finally {
    await resetCodexAppServerForTests();
  }
});

