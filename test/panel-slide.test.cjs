const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Collapsed panel yields no layout width', () => {
  const cssPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'panel.css'
  );
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(contents, /ageaf-panel--collapsed[\s\S]*width:\s*0/);
});
