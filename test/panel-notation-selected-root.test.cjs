const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('notation scan roots at selected tex file and follows its inputs', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const start = contents.indexOf('const collectNotationAttachments = async');
  assert.ok(start >= 0, 'expected collectNotationAttachments');
  const end = contents.indexOf('const onNotationConsistencyPass', start);
  assert.ok(end >= 0, 'expected onNotationConsistencyPass after collector');
  const block = contents.slice(start, end);

  assert.match(block, /getActiveFilename\(\)/, 'notation scan should read current active filename');
  assert.match(block, /getActiveFileId\(\)/, 'notation scan should read current active file id');
  assert.match(block, /selectNotationRootEntry\(/, 'notation scan should resolve a single root tex entry');
  assert.match(block, /enqueueEntry\(rootSelection\.entry,\s*'dom'\)/, 'notation scan should enqueue only the selected root entry first');
  assert.doesNotMatch(
    block,
    /for \(const entry of domEntries\) enqueueEntry\(entry, 'dom'\);/,
    'notation scan should not enqueue every DOM file as a root'
  );
});
