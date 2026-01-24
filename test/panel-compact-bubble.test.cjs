const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Chat bubbles use compact padding and sizing', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(contents, /\.ageaf-message\s*\{[^}]*padding:\s*6px\s+10px;/s);
  assert.match(contents, /\.ageaf-message\s*\{[^}]*display:\s*inline-block;/s);
});
