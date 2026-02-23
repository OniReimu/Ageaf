const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function extractComponentBlock(source, exportName) {
  const start = source.indexOf(`export const ${exportName} =`);
  if (start < 0) return null;
  const next = source.indexOf('export const ', start + 1);
  if (next < 0) return source.slice(start);
  return source.slice(start, next);
}

test('Notation check icon uses a distinct magnifier motif', () => {
  const iconPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'ageaf-icons.tsx'
  );
  const contents = fs.readFileSync(iconPath, 'utf8');

  const notationBlock = extractComponentBlock(contents, 'NotationCheckIcon');
  const referencesBlock = extractComponentBlock(contents, 'CheckReferencesIcon');

  assert.ok(notationBlock, 'NotationCheckIcon export should exist');
  assert.ok(referencesBlock, 'CheckReferencesIcon export should exist');

  assert.match(notationBlock, /a3\.5 3\.5/);
  assert.match(notationBlock, /L15\.5 15\.5/);
  assert.doesNotMatch(referencesBlock, /a3\.5 3\.5/);
});
