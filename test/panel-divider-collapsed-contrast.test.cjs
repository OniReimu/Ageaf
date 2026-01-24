const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Collapsed divider uses high-contrast line for white backgrounds', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(contents, /\.ageaf-panel--collapsed\s+\.ageaf-panel__divider::before/);
  assert.match(contents, /rgba\(0,\s*0,\s*0,\s*0\.6\)/);
  assert.match(contents, /mix-blend-mode:\s*normal/);
});

