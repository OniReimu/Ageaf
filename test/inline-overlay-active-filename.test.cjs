const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Inline diff overlay extracts active file name from tab labels', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  assert.ok(
    contents.includes('function extractFilenameFromLabel'),
    'expected inline overlay to define extractFilenameFromLabel()'
  );

  const start = contents.indexOf('function getActiveTabName');
  assert.ok(start >= 0, 'expected getActiveTabName()');
  const end = contents.indexOf('function matchesActiveFile', start);
  assert.ok(end >= 0, 'expected matchesActiveFile() after getActiveTabName()');
  const block = contents.slice(start, end);

  assert.ok(
    block.includes('const selectors'),
    'expected getActiveTabName() to iterate a selector list'
  );
  const cmIdx = block.indexOf('.cm-tab');
  const roleTabIdx = block.indexOf('[role="tab"]');
  assert.ok(cmIdx >= 0, 'expected getActiveTabName() selectors to include .cm-tab');
  assert.ok(
    roleTabIdx >= 0,
    'expected getActiveTabName() selectors to include [role="tab"]'
  );
  assert.ok(
    cmIdx < roleTabIdx,
    'expected getActiveTabName() to prioritize editor tabs over sidebar tabs'
  );

  assert.ok(
    block.includes('extractFilenameFromLabel'),
    'expected getActiveTabName() to use extractFilenameFromLabel()'
  );
  assert.match(
    block,
    /return\s+null\s*;/,
    'expected getActiveTabName() to return null when no filename is found'
  );
});
