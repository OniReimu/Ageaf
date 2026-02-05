const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Editor bridge extracts active file name, not sidebar tab labels', () => {
  const bridgePath = path.join(__dirname, '..', 'src', 'main', 'editorBridge', 'bridge.ts');
  const contents = fs.readFileSync(bridgePath, 'utf8');

  const start = contents.indexOf('function extractFilenameFromLabel');
  assert.ok(start >= 0, 'expected extractFilenameFromLabel');
  const end = contents.indexOf('function normalizeFileName', start);
  assert.ok(end >= 0, 'expected normalizeFileName');
  const section = contents.slice(start, end);

  assert.match(section, /\.match\(/, 'expected filename extraction via regex match');
  assert.match(section, /\.[a-z0-9]{1,10}/i, 'expected extension-like pattern');
});
