import assert from 'node:assert/strict';
import test from 'node:test';

import { extractAgeafPatchFence } from '../src/patch/ageafPatchFence.js';
import { validatePatch } from '../src/validate.js';

test('extractAgeafPatchFence finds ageaf-patch fenced JSON', () => {
  const output = [
    'Proposed change:',
    '',
    '```ageaf-patch',
    '{"kind":"replaceRangeInFile","filePath":"main.tex","expectedOldText":"old","text":"new"}',
    '```',
    '',
    'Notes: updated wording.',
  ].join('\n');

  const fence = extractAgeafPatchFence(output);
  assert.equal(
    fence,
    '{"kind":"replaceRangeInFile","filePath":"main.tex","expectedOldText":"old","text":"new"}'
  );
  assert.deepEqual(validatePatch(JSON.parse(fence)), {
    kind: 'replaceRangeInFile',
    filePath: 'main.tex',
    expectedOldText: 'old',
    text: 'new',
  });
});

