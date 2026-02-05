const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Citation indicator extracts active file name from tab labels', () => {
  const target = path.join(__dirname, '..', 'src', 'main', 'citationIndicator.ts');
  const contents = fs.readFileSync(target, 'utf8');

  const start = contents.indexOf('function getActiveTabName');
  assert.ok(start >= 0, 'expected getActiveTabName()');
  const end = contents.indexOf('function normalizeTabFileName', start);
  assert.ok(end >= 0, 'expected normalizeTabFileName() after getActiveTabName()');
  const block = contents.slice(start, end);

  assert.ok(
    block.includes('const selectors'),
    'expected getActiveTabName() to iterate a selector list'
  );
  const cmIdx = block.indexOf('.cm-tab');
  const roleTabIdx = block.indexOf('[role="tab"]');
  assert.ok(cmIdx >= 0, 'expected selectors to include .cm-tab');
  assert.ok(roleTabIdx >= 0, 'expected selectors to include [role="tab"]');
  assert.ok(
    cmIdx < roleTabIdx,
    'expected getActiveTabName() to prioritize editor tabs over sidebar tabs'
  );

  assert.ok(
    contents.includes('function extractFilenameFromLabel'),
    'expected citation indicator to define extractFilenameFromLabel()'
  );
  assert.ok(
    block.includes('extractFilenameFromLabel'),
    'expected getActiveTabName() to use extractFilenameFromLabel()'
  );
});

