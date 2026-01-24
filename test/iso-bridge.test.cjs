const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('ISO content script exposes Ageaf editor bridge', () => {
  const scriptPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'contentScript.ts'
  );
  const contents = fs.readFileSync(scriptPath, 'utf8');

  assert.match(contents, /ageafBridge/);
  assert.match(contents, /ageaf:editor:request/);
  assert.match(contents, /ageaf:editor:response/);
  assert.match(contents, /ageaf:editor:replace/);
  assert.match(contents, /ageaf:editor:insert/);
});
