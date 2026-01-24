const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel divider handle is keyboard accessible and shows tooltip copy', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-panel__divider-toggle/);
  assert.match(contents, /aria-controls="ageaf-panel-inner"/);
  assert.match(contents, /Hide panel/);
  assert.match(contents, /Show panel/);
  assert.match(contents, /Click to hide the panel/);
  assert.match(contents, /Click to show the panel/);
});
