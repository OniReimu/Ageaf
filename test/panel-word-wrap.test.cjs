const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel CSS has min-width: 0 for proper word wrapping', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  // Check that .ageaf-panel__body has min-width: 0
  assert.match(contents, /\.ageaf-panel__body\s*\{[^}]*min-width:\s*0/);

  // Check that .ageaf-panel__chat has min-width: 0
  assert.match(contents, /\.ageaf-panel__chat\s*\{[^}]*min-width:\s*0/);

  // Check that .ageaf-panel__input has min-width: 0
  assert.match(contents, /\.ageaf-panel__input\s*\{[^}]*min-width:\s*0/);
});
