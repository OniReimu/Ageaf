const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel has diff review hook', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');
  const diffPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'DiffReview.tsx');
  const diffContents = fs.readFileSync(diffPath, 'utf8');
  const chatStorePath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'chatStore.ts');
  const chatStoreContents = fs.readFileSync(chatStorePath, 'utf8');

  assert.match(contents, /DiffReview/);
  assert.match(diffContents, /ageaf-diff-review/);
  assert.match(diffContents, /Diff unavailable/);
  assert.match(diffContents, /catch/);
  assert.match(contents, /SelectionSnapshot/);
  assert.match(contents, /useRef<\s*Map<\s*string\s*,\s*SelectionSnapshot\s*>/);
  assert.match(contents, /jobId\s*->\s*snapshot/);
  assert.match(contents, /Review changes/);
  assert.match(contents, /patchReview\.kind\s*===\s*['"]replaceSelection['"]/);
  assert.match(contents, /replaceRangeInFile/);
  assert.match(contents, /<DiffReview/);
  assert.match(contents, /patchReview/);
  assert.match(chatStoreContents, /patchReview/);
});
