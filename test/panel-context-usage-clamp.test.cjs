const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('panel normalizes context usage to never exceed 100%', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /normalizeContextUsage/);
  assert.match(contents, /Math\.min\(\s*usedTokens\s*,\s*contextWindow\s*\)/);
});
