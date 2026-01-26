const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Runtime pickers expand upward and use hover menus', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(contents, /\.ageaf-runtime\s*\{[^}]*display:\s*flex;/s);
  assert.match(contents, /\.ageaf-runtime__menu\s*\{[^}]*position:\s*absolute;/s);
  assert.match(contents, /\.ageaf-runtime__menu\s*\{[^}]*bottom:\s*calc\(100%\s*\+\s*\d+px\)/s);
  // Check for hover menu visibility (either through picker hover or menu hover)
  assert.match(contents, /\.ageaf-runtime__picker:hover\s+\.ageaf-runtime__menu[^{]*,[\s\S]*?\.ageaf-runtime__menu:hover[\s\S]*?\{[^}]*opacity:\s*1;/s);
  assert.doesNotMatch(contents, /ageaf-runtime__picker:focus-within\s+\.ageaf-runtime__menu/);
  assert.match(contents, /\.ageaf-runtime__menu::before\s*\{/);
});
