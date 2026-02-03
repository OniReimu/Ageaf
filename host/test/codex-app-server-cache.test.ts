import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { getCodexRuntimeMetadata } from '../src/runtimes/codex/metadata.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

function getDoneStatus(events: JobEvent[]) {
  const done = events.find((event) => event.event === 'done');
  return done ? String((done.data as any)?.status ?? '') : null;
}

test('Codex app-server caching does not kill an in-flight turn when metadata is fetched (different cwd)', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex');
  const previousDelay = process.env.CODEX_TEST_DELAY_MS;
  const previousTimeout = process.env.AGEAF_CODEX_TURN_TIMEOUT_MS;

  try {
    await resetCodexAppServerForTests();
    process.env.CODEX_TEST_DELAY_MS = '250';
    process.env.AGEAF_CODEX_TURN_TIMEOUT_MS = '2000';

    const events: JobEvent[] = [];
    const jobPromise = runCodexJob(
      {
        action: 'chat',
        context: { message: 'Hello' },
        userSettings: { debugCliEvents: false },
        runtime: {
          codex: {
            cliPath,
            envVars: '',
            approvalPolicy: 'never',
            // Force a per-thread cwd so metadata (global cwd) uses a different app-server instance.
            threadId: 'thread-1',
          },
        },
      },
      (event) => events.push(event)
    );

    // While the turn is still in-flight, fetch metadata (uses ~/.ageaf cwd).
    await new Promise((resolve) => setTimeout(resolve, 30));
    await getCodexRuntimeMetadata({ cliPath, envVars: '' });

    await jobPromise;
    assert.equal(getDoneStatus(events), 'ok');
  } finally {
    if (previousDelay === undefined) delete process.env.CODEX_TEST_DELAY_MS;
    else process.env.CODEX_TEST_DELAY_MS = previousDelay;
    if (previousTimeout === undefined) delete process.env.AGEAF_CODEX_TURN_TIMEOUT_MS;
    else process.env.AGEAF_CODEX_TURN_TIMEOUT_MS = previousTimeout;
    await resetCodexAppServerForTests();
  }
});

