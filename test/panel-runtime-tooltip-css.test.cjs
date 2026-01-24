const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Context usage tooltip uses data-tooltip hover styles', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(contents, /\.ageaf-runtime__usage::after\s*\{[^}]*content:\s*attr\(data-tooltip\)/s);
  assert.match(contents, /\.ageaf-runtime__usage:hover::after\s*\{[^}]*opacity:\s*1;/s);
});
