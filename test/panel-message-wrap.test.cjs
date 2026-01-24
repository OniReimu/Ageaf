const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Message bubbles allow wrapping and avoid fixed fit-content width', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.doesNotMatch(contents, /\.ageaf-message\s*\{[^}]*width:\s*fit-content;/s);
  assert.match(contents, /\.ageaf-message\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(contents, /\.ageaf-message\s*\{[^}]*box-sizing:\s*border-box;/s);
  assert.match(contents, /\.ageaf-message\s*\{[^}]*max-width:\s*100%;/s);
  assert.match(contents, /\.ageaf-message\s+pre\s*\{[^}]*white-space:\s*pre-wrap;/s);
});
