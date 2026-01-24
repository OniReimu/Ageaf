const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Content script injects Ageaf layout wrapper', () => {
  const contentScriptPath = path.join(__dirname, '..', 'src', 'iso', 'contentScript.ts');
  const contents = fs.readFileSync(contentScriptPath, 'utf8');

  assert.match(contents, /ageaf-layout/);
  assert.match(contents, /ageaf-layout__main/);
});
