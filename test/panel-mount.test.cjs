const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Content script mounts Ageaf panel', () => {
  const contentScriptPath = path.join(__dirname, '..', 'src', 'iso', 'contentScript.ts');
  const contents = fs.readFileSync(contentScriptPath, 'utf8');

  assert.match(contents, /mountPanel/);
});
