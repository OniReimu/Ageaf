import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

/**
 * When the LLM response contains BOTH ageaf-patch fences AND AGEAF_FILE_UPDATE
 * markers for the same file, the Codex runtime must NOT emit duplicate patches.
 * Only one set of patches should be produced (from whichever path processes first).
 */
test('Codex runtime skips ageaf-patch fences when FILE_UPDATE patches exist', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-file-update-dedup');
  const events: JobEvent[] = [];

  const originalBib = [
    '@article{foo2023,',
    '  title={Some Paper},',
    '  year={2023},',
    '}',
    '',
  ].join('\n');

  const message = [
    'Check references.',
    '',
    '[Overleaf file: references.bib]',
    '```bibtex',
    originalBib.trimEnd(),
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

    const patchEvents = events.filter((event) => event.event === 'patch');

    // Should get patches, but NOT duplicates
    assert.ok(patchEvents.length > 0, 'expected at least one patch event');

    // Count patches for the year change specifically
    const yearPatches = patchEvents.filter((event) => {
      const data = event.data as any;
      return data?.text?.includes('year={2025}');
    });

    assert.equal(
      yearPatches.length,
      1,
      `expected exactly 1 year={2025} patch but got ${yearPatches.length} — ` +
      'ageaf-patch fence should be suppressed when FILE_UPDATE patches exist'
    );
  } finally {
    await resetCodexAppServerForTests();
  }
});
