const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel prefers selection activeName for chip filenames', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  const snapshotStart = contents.indexOf('const selectionSnapshot: SelectionSnapshot');
  assert.ok(snapshotStart >= 0, 'expected selectionSnapshot');
  const snapshotEnd = contents.indexOf('selectionSnapshotsRef.current.set', snapshotStart);
  assert.ok(snapshotEnd >= 0, 'expected selectionSnapshotsRef.current.set');
  const snapshotSection = contents.slice(snapshotStart, snapshotEnd);
  assert.match(snapshotSection, /activeName/);

  const chipStart = contents.indexOf('const insertChipFromSelection');
  assert.ok(chipStart >= 0, 'expected insertChipFromSelection');
  const chipEnd = contents.indexOf('const renderMessageContent', chipStart);
  assert.ok(chipEnd >= 0, 'expected renderMessageContent after insertChipFromSelection');
  const chipSection = contents.slice(chipStart, chipEnd);
  assert.match(chipSection, /activeName/);
});

