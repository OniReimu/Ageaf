const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel header owns the intro copy (no initial system blocks)', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.doesNotMatch(contents, /Ready to assist on this Overleaf project/);
  assert.match(contents, /Your Overleaf Agent/);
});

