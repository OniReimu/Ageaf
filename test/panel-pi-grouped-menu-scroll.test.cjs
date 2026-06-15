const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('PI grouped model menu uses flyout submenu positioned to the left', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(
    contents,
    /\.ageaf-runtime__menu--grouped\s*\{[^}]*overflow:\s*visible/s,
    'Grouped PI menu must not clip flyout submenu (overflow: visible)'
  );

  assert.match(
    contents,
    /\.ageaf-runtime__group-models\s*\{[^}]*position:\s*absolute/s,
    'Model submenu should be absolutely positioned for flyout'
  );

  assert.match(
    contents,
    /\.ageaf-runtime__group:hover\s*>\s*\.ageaf-runtime__group-models\s*\{[^}]*display:\s*grid/s,
    'Model submenu should become visible on provider hover'
  );
});
