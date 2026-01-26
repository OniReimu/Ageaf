const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('refreshContextUsage works in native mode without hostUrl', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const start = contents.indexOf('const refreshContextUsage = async');
  assert.ok(start !== -1, 'expected refreshContextUsage');
  const chunk = contents.slice(start, start + 2500);

  assert.match(chunk, /options\.transport\s*!==\s*['"]native['"]\s*&&\s*!options\.hostUrl/);
  assert.doesNotMatch(chunk, /if\s*\(\s*!options\.hostUrl\s*\)\s*return/);
});

