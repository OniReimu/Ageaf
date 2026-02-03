import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

function getTraceMessages(events: JobEvent[]) {
  return events
    .filter((event) => event.event === 'trace')
    .map((event) => String((event.data as any)?.message ?? ''));
}

test('Codex trace stream is curated by default (raw events gated by env)', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex');
  const previousTraceAll = process.env.AGEAF_CODEX_TRACE_ALL_EVENTS;

  try {
    await resetCodexAppServerForTests();
    delete process.env.AGEAF_CODEX_TRACE_ALL_EVENTS;
    const events: JobEvent[] = [];
    await runCodexJob(
      {
        action: 'chat',
        context: { message: 'Hello' },
        userSettings: { debugCliEvents: true },
        runtime: { codex: { cliPath, envVars: '', approvalPolicy: 'on-request' } },
      },
      (event) => events.push(event)
    );

    const messages = getTraceMessages(events);
    assert.ok(messages.some((msg) => msg.startsWith('Codex:')), 'expected curated Codex trace events');
    assert.equal(
      messages.some((msg) => msg.startsWith('[Codex Event]')),
      false,
      'expected raw event trace to be disabled by default'
    );
  } finally {
    if (previousTraceAll === undefined) delete process.env.AGEAF_CODEX_TRACE_ALL_EVENTS;
    else process.env.AGEAF_CODEX_TRACE_ALL_EVENTS = previousTraceAll;
    await resetCodexAppServerForTests();
  }
});

test('Codex stderr lines can be surfaced as trace events when debug is enabled', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex');
  const previousStderr = process.env.CODEX_TEST_STDERR;

  try {
    await resetCodexAppServerForTests();
    process.env.CODEX_TEST_STDERR = 'true';
    const events: JobEvent[] = [];
    await runCodexJob(
      {
        action: 'chat',
        context: { message: 'Hello' },
        userSettings: { debugCliEvents: true },
        runtime: { codex: { cliPath, envVars: '', approvalPolicy: 'on-request' } },
      },
      (event) => events.push(event)
    );

    const stderrTrace = events.find(
      (event) =>
        event.event === 'trace' &&
        String((event.data as any)?.message ?? '') === 'Codex stderr'
    );
    assert.ok(stderrTrace, 'expected Codex stderr trace event');
    assert.match(String((stderrTrace?.data as any)?.line ?? ''), /Test stderr line from fixture/);
  } finally {
    if (previousStderr === undefined) delete process.env.CODEX_TEST_STDERR;
    else process.env.CODEX_TEST_STDERR = previousStderr;
    await resetCodexAppServerForTests();
  }
});
