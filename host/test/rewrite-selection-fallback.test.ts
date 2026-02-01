import assert from 'node:assert/strict';
import test from 'node:test';

import { extractRewriteTextWithFallback } from '../src/workflows/rewriteSelection.js';

test('extractRewriteTextWithFallback: prefers markers when present', () => {
  const input = [
    'notes',
    '<<<AGEAF_REWRITE>>>',
    'Hello \\cite{a}.',
    '<<<AGEAF_REWRITE_END>>>',
    'should be ignored',
  ].join('\n');
  const out = extractRewriteTextWithFallback(input);
  assert.equal(out.usedFallback, false);
  assert.equal(out.text, 'Hello \\cite{a}.');
});

test('extractRewriteTextWithFallback: falls back to last fenced block', () => {
  const input = [
    '- change note',
    '',
    '```latex',
    'Rewritten \\ref{fig:1}.',
    '```',
  ].join('\n');
  const out = extractRewriteTextWithFallback(input);
  assert.equal(out.usedFallback, true);
  assert.equal(out.text, 'Rewritten \\ref{fig:1}.');
});

test('extractRewriteTextWithFallback: falls back to trailing text after bullets', () => {
  const input = [
    '- note 1',
    '- note 2',
    '',
    'Rewritten text line 1.',
    'Rewritten text line 2.',
  ].join('\n');
  const out = extractRewriteTextWithFallback(input);
  assert.equal(out.usedFallback, true);
  assert.equal(out.text, 'Rewritten text line 1.\nRewritten text line 2.');
});


