const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('background native request handler guards connectNative and postMessage', () => {
  const backgroundPath = path.join(__dirname, '..', 'src', 'background.ts');
  const contents = fs.readFileSync(backgroundPath, 'utf8');

  assert.match(contents, /try\s*\{[\s\S]*?chrome\.runtime\.connectNative/);
  assert.match(contents, /try\s*\{\s*port\.postMessage/);
  assert.match(contents, /native_unavailable/);
});
