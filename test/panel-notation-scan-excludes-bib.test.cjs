const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Notation scan extension set excludes .bib', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const match = contents.match(
    /const NOTATION_SCAN_EXTENSIONS = new Set\(\[([\s\S]*?)\]\);/
  );
  assert.ok(match, 'expected NOTATION_SCAN_EXTENSIONS definition');

  const block = match[1] ?? '';
  assert.doesNotMatch(block, /'\.bib'/, 'notation scan should not include .bib');
});
