import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { sendCompactCommand } from '../src/compaction/sendCompact.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex compaction emits usage updates', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex');
  const events: JobEvent[] = [];

  try {
    // Create a real thread so /compact has something to operate on.
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

    const threadId = (events.find((event) => event.event === 'done')?.data as any)?.threadId;
    assert.equal(typeof threadId, 'string');
    assert.ok(threadId);

    events.length = 0;

    await sendCompactCommand(
      'codex',
      {
        runtime: { codex: { cliPath, envVars: '', approvalPolicy: 'on-request', threadId } },
      },
      (event) => events.push(event)
    );

    const usageEvents = events.filter((event) => event.event === 'usage');
    assert.ok(usageEvents.length > 0, 'expected usage events during compaction');
  } finally {
    await resetCodexAppServerForTests();
  }
});

