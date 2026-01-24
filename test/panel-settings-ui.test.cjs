const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel includes settings button and tabs', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-panel__settings/);
  assert.match(contents, /Connection/);
  assert.match(contents, /Authentication/);
  assert.doesNotMatch(contents, /Advanced/);
});
