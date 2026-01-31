const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Pasting large text prefers Overleaf selection over clipboard', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const start = contents.indexOf('const handlePaste');
  assert.ok(start >= 0, 'expected handlePaste implementation');
  const end = contents.indexOf('const hasImageTransfer', start);
  assert.ok(end >= 0, 'expected handlePaste to appear before hasImageTransfer');

  const snippet = contents.slice(start, end);
  assert.match(snippet, /shouldChipPaste/);
  assert.match(snippet, /requestSelection/);
});

