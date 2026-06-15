import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex runtime waits for retryable compaction flow and completes', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-compaction-retry');
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
    assert.equal(output, 'Recovered after compaction');

    const done = events.find((event) => event.event === 'done');
    assert.ok(done, 'expected done event');
    assert.equal((done?.data as any)?.status, 'ok');

    const compactPlans = events.filter(
      (event) =>
        event.event === 'plan' &&
        (String((event.data as any)?.toolName ?? '').toLowerCase().includes('compact') ||
          String((event.data as any)?.message ?? '').toLowerCase().includes('compact'))
    );
    assert.ok(compactPlans.length > 0, 'expected compaction plan events');

    const compactStarts = compactPlans.filter(
      (event) => String((event.data as any)?.phase ?? '') === 'tool_start'
    );
    const compactCompletions = compactPlans.filter((event) => {
      const phase = String((event.data as any)?.phase ?? '');
      return phase === 'compaction_complete' || phase === 'tool_complete';
    });

    assert.ok(compactStarts.length > 0, 'expected compaction start events');
    assert.ok(
      compactCompletions.length > 0,
      'expected compaction completion events'
    );

    assert.ok(
      compactStarts.some((event) => String((event.data as any)?.toolId ?? '') === 'compaction-1'),
      'expected compaction start to preserve source compaction itemId'
    );
    assert.ok(
      compactCompletions.some(
        (event) => String((event.data as any)?.toolId ?? '') === 'compaction-1'
      ),
      'expected compaction completion to preserve source compaction itemId'
    );
  } finally {
    await resetCodexAppServerForTests();
  }
});
