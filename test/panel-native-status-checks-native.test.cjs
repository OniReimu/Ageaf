const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('panel native host retry checks native messaging directly', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /Native host status/);
  assert.match(contents, /ageaf:native-request/);
  assert.match(contents, /path:\s*['"]\/v1\/health['"]/);
});
