const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Context usage ring encodes the same percentage as the numeric label', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /const ringCircumference\s*=\s*2\s*\*\s*Math\.PI\s*\*\s*10/);
  assert.match(contents, /const pct\s*=\s*Math\.min\(100,\s*Math\.max\(0,\s*usagePercent\)\)/);
  assert.match(contents, /const progress\s*=\s*\(ringCircumference\s*\*\s*pct\)\s*\/\s*100/);
  assert.match(contents, /circle\.setAttribute\('stroke-dashoffset',\s*String\(offset\)\)/);
  assert.match(contents, /ref=\{contextRingRef\}/);
});
