import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeNotationConsistencyFiles,
  buildNotationDraftPatches,
  type ProjectTextFile,
} from '../src/workflows/notationConsistency.js';

function getKinds(
  findings: ReturnType<typeof analyzeNotationConsistencyFiles>['findings']
) {
  return new Set(findings.map((finding) => finding.kind));
}

test('notation analysis finds acronym inconsistency, symbol conflict, and term drift', () => {
  const files: ProjectTextFile[] = [
    {
      path: 'main.tex',
      content: [
        '\\newacronym{llm}{LLM}{Large Language Model}',
        'Let $x$ denote the temperature in Kelvin.',
        'A state-of-the-art baseline is used.',
      ].join('\n'),
    },
    {
      path: 'methods.tex',
      content: [
        'The Layered Language Model (LLM) has a larger context.',
        'Let $x$ denote the velocity of the fluid.',
        'This state of the art baseline is competitive.',
      ].join('\n'),
    },
  ];

  const analysis = analyzeNotationConsistencyFiles(files);
  const kinds = getKinds(analysis.findings);

  assert.equal(analysis.filesScanned, 2);
  assert.ok(kinds.has('acronym_inconsistency'));
  assert.ok(kinds.has('symbol_conflict'));
  assert.ok(kinds.has('term_drift'));
});

test('notation draft patches include canonical acronym expansion replacements', () => {
  const files: ProjectTextFile[] = [
    {
      path: 'main.tex',
      content: '\\newacronym{llm}{LLM}{Large Language Model}\n',
    },
    {
      path: 'discussion.tex',
      content: 'The Layered Language Model (LLM) is robust.\n',
    },
  ];

  const analysis = analyzeNotationConsistencyFiles(files);
  const patches = buildNotationDraftPatches(analysis.findings);

  const acronymPatch = patches.find(
    (patch) =>
      patch.kind === 'replaceRangeInFile' && patch.filePath === 'discussion.tex'
  );

  assert.ok(acronymPatch);
  if (!acronymPatch || acronymPatch.kind !== 'replaceRangeInFile') {
    throw new Error('Expected replaceRangeInFile acronym patch');
  }
  assert.match(acronymPatch.expectedOldText, /Layered Language Model \(LLM\)$/);
  assert.equal(acronymPatch.text, 'Large Language Model (LLM)');
  assert.ok(typeof acronymPatch.lineFrom === 'number' && acronymPatch.lineFrom > 0);
});
