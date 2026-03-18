import assert from 'node:assert/strict';
import test from 'node:test';

import { extractAgeafPatchFence, extractAllAgeafPatchFences } from '../src/patch/ageafPatchFence.js';
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

test('extractAllAgeafPatchFences returns all patch blocks', () => {
  const output = [
    'Patch 1/3:',
    '',
    '```ageaf-patch',
    '{"kind":"replaceRangeInFile","filePath":"refs.bib","expectedOldText":"old1","text":"new1"}',
    '```',
    '',
    'Patch 2/3:',
    '',
    '```ageaf-patch',
    '{"kind":"replaceRangeInFile","filePath":"refs.bib","expectedOldText":"old2","text":"new2"}',
    '```',
    '',
    'Patch 3/3:',
    '',
    '```ageaf-patch',
    '{"kind":"replaceRangeInFile","filePath":"main.tex","expectedOldText":"old3","text":"new3"}',
    '```',
  ].join('\n');

  const fences = extractAllAgeafPatchFences(output);
  assert.equal(fences.length, 3);
  assert.deepEqual(validatePatch(JSON.parse(fences[0])), {
    kind: 'replaceRangeInFile',
    filePath: 'refs.bib',
    expectedOldText: 'old1',
    text: 'new1',
  });
  assert.deepEqual(validatePatch(JSON.parse(fences[2])), {
    kind: 'replaceRangeInFile',
    filePath: 'main.tex',
    expectedOldText: 'old3',
    text: 'new3',
  });
});

test('extractAllAgeafPatchFences returns empty array when no patches', () => {
  assert.deepEqual(extractAllAgeafPatchFences('no patches here'), []);
});

test('extractAllAgeafPatchFences returns single-element array for one patch', () => {
  const output = '```ageaf-patch\n{"kind":"replaceSelection","text":"hello"}\n```';
  const fences = extractAllAgeafPatchFences(output);
  assert.equal(fences.length, 1);
});

