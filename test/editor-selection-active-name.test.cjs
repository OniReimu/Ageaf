const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Editor bridge selection response includes active file name', () => {
  const bridgePath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'editorBridge',
    'bridge.ts'
  );
  const contents = fs.readFileSync(bridgePath, 'utf8');

  const start = contents.indexOf('function onSelectionRequest');
  assert.ok(start >= 0, 'expected onSelectionRequest');
  const end = contents.indexOf('window.dispatchEvent', start);
  assert.ok(end >= 0, 'expected dispatchEvent');
  const section = contents.slice(start, end);

  assert.match(section, /activeName/);
});

