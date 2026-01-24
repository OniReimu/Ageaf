const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('User message bubbles align to the right edge', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(contents, /\.ageaf-message--user\s*\{[^}]*justify-self:\s*end;/s);
  assert.match(contents, /\.ageaf-message--user\s*\{[^}]*align-self:\s*end;/s);
});
