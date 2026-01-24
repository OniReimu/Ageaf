const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Collapsed panel keeps a visible divider toggle', () => {
  const cssPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'panel.css'
  );
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(contents, /ageaf-panel__divider/);
  assert.match(contents, /height:\s*100vh/);
  assert.match(contents, /ageaf-panel--collapsed .*ageaf-panel__divider[\s\S]*left:\s*calc\(-1 \* var\(--ageaf-divider-hit\)\)/);
  assert.match(contents, /ageaf-panel--collapsed .*ageaf-panel__inner[\s\S]*display:\s*none/);
});
