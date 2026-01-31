import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex chat prompt includes selection patch guidance when selection context is present', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-check-selection-patch-guidance');
  const events: JobEvent[] = [];

  try {
    await runCodexJob(
      {
        action: 'chat',
        context: {
          message: 'Proofread the selected text.',
          selection: 'Hello world',
          surroundingBefore: '',
          surroundingAfter: '',
        },
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

    assert.match(deltaText, /HAS_SELECTION_PATCH_GUIDANCE/);
  } finally {
    await resetCodexAppServerForTests();
  }
});

