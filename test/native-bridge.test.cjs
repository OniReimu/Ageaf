const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('background registers native messaging bridge', () => {
  const backgroundPath = path.join(__dirname, '..', 'src', 'background.ts');
  const contents = fs.readFileSync(backgroundPath, 'utf8');

  assert.match(contents, /connectNative/);
  assert.match(contents, /ageaf:native-request/);
});
