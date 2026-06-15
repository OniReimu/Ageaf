const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('normalizeFilenameLabel strips book-number prefixed filename tokens', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const start = contents.indexOf('const normalizeFilenameLabel');
  assert.ok(start >= 0, 'expected normalizeFilenameLabel');
  const end = contents.indexOf('const getActiveFilename', start);
  assert.ok(end >= 0, 'expected getActiveFilename');
  const section = contents.slice(start, end);

  assert.match(section, /book\[_-]\?\\d\+/);
  assert.match(section, /slice\(bookPrefix\[0\]\.length\)/);
});
