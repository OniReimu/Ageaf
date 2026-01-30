const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel exposes rewrite selection action', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /Rewrite selection/);
  assert.match(contents, /sendMessage\([^\n]*'Rewrite selection'[^\n]*'rewrite'[^\n]*\)/);
});
