const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('detectProjectFilesFromDom strips description/book-number prefixed filename tokens', () => {
  const target = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(target, 'utf8');

  const exportStart = contents.indexOf('export const detectProjectFilesFromDom');
  assert.ok(exportStart >= 0, 'expected exported detectProjectFilesFromDom');
  const exportBlock = contents.slice(exportStart, exportStart + 5000);

  assert.match(
    exportBlock,
    /startsWith\('description'\)/,
    'expected description-prefix guard in detectProjectFilesFromDom extraction'
  );
  assert.match(
    exportBlock,
    /slice\('description'\.length\)/,
    'expected description-prefix stripping in detectProjectFilesFromDom extraction'
  );
  assert.match(
    exportBlock,
    /book\[_-]\?\\d\+/,
    'expected book-number prefix guard in detectProjectFilesFromDom extraction'
  );
});
