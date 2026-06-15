const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Review-card lineFrom backfill only reads active file to avoid tab switching on session change', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const effectStart = contents.indexOf('type BackfillEntry = {');
  assert.ok(effectStart >= 0, 'expected review-card backfill effect');
  const effectEnd = contents.indexOf('const hydrateChatForProject', effectStart);
  assert.ok(effectEnd > effectStart, 'expected end of backfill effect');
  const section = contents.slice(effectStart, effectEnd);

  assert.match(
    section,
    /const activeFilename = getActiveFilename\(\)\?\.toLowerCase\(\) \?\? null;/
  );
  assert.match(
    section,
    /const normalizedFilePath = group\.filePath\.trim\(\)\.toLowerCase\(\);/
  );
  assert.match(
    section,
    /const normalizedBaseName =[\s\S]*normalizedFilePath\.split\('\/'\)\.filter\(Boolean\)\.pop\(\) \?\?[\s\S]*normalizedFilePath;/
  );
  assert.match(
    section,
    /if \(\s*!activeFilename\s*\|\|\s*\(\s*normalizedFilePath !== activeFilename[\s\S]*normalizedBaseName !== activeFilename\s*\)\s*\)\s*\{\s*continue;\s*\}/s
  );
  assert.match(section, /response = await bridge\.requestFileContent\(group\.filePath\);/);
});
