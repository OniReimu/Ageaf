import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex chat prompt includes file update guidance when Overleaf file blocks are present', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-check-file-update-guidance');
  const events: JobEvent[] = [];

  const message = [
    'Please proofread.',
    '',
    '[Overleaf file: main.tex]',
    '```tex',
    'Hello world',
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

    assert.match(deltaText, /HAS_FILE_UPDATE_GUIDANCE/);
  } finally {
    await resetCodexAppServerForTests();
  }
});

