import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

test('Codex rewrite prompt keeps LaTeX selection raw (no JSON-escaped backslashes)', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-check-rewrite-selection-latex');
  const events: JobEvent[] = [];

  try {
    await runCodexJob(
      {
        action: 'rewrite',
        context: {
          message: 'Rewrite selection',
          selection: '\\cite{foo}',
          surroundingBefore: 'Intro text.',
          surroundingAfter: 'More text.',
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

    assert.match(deltaText, /HAS_RAW_LATEX_SELECTION/);
    assert.doesNotMatch(deltaText, /HAS_ESCAPED_JSON_SELECTION/);
  } finally {
    await resetCodexAppServerForTests();
  }
});
