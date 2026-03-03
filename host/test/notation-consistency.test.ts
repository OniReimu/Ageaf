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

test('notation analysis flags acronym usage before first definition', () => {
  const files: ProjectTextFile[] = [
    {
      path: 'intro.tex',
      content: [
        'LLM systems are now common.',
        'A Large Language Model (LLM) can follow instructions.',
      ].join('\n'),
    },
  ];

  const analysis = analyzeNotationConsistencyFiles(files);
  const finding = analysis.findings.find(
    (item) =>
      item.kind === 'acronym_inconsistency' &&
      /before its first definition/i.test(item.summary)
  );

  assert.ok(finding);
  assert.equal(finding?.subject, 'LLM');
});

test('notation draft patches abbreviate repeated full term after first definition', () => {
  const files: ProjectTextFile[] = [
    {
      path: 'main.tex',
      content: [
        'A Large Language Model (LLM) can be instruction-tuned.',
        'The Large Language Model then adapts at test time.',
      ].join('\n'),
    },
  ];

  const analysis = analyzeNotationConsistencyFiles(files);
  const patches = buildNotationDraftPatches(analysis.findings);
  const abbreviationPatches = patches.filter(
    (patch) =>
      patch.kind === 'replaceRangeInFile' &&
      patch.filePath === 'main.tex' &&
      patch.expectedOldText === 'Large Language Model' &&
      patch.text === 'LLM'
  );

  assert.equal(abbreviationPatches.length, 1);
});
