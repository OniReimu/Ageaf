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

test('Codex replaceRangeInFile fence preserves absolute offsets and lineFrom', async () => {
  const cliPath = path.join(
    process.cwd(),
    'test',
    'fixtures',
    'codex-patch-replace-range'
  );
  const events: JobEvent[] = [];

  try {
    await runCodexJob(
      {
        action: 'chat',
        context: { message: 'Apply the file edit patch' },
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

    const patchEvents = events.filter((event) => event.event === 'patch');
    assert.equal(patchEvents.length, 1, 'expected exactly one patch event');
    assert.deepEqual(patchEvents[0]?.data, {
      kind: 'replaceRangeInFile',
      filePath: 'main.tex',
      expectedOldText: '\\title{A}\\n\\author{B}',
      text: '\\begin{document}\\n\\title{A}\\n\\author{B}',
      from: 420,
      to: 440,
      lineFrom: 43,
    });
  } finally {
    await resetCodexAppServerForTests();
  }
});
