const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('background native bridge guards postMessage calls', () => {
  const backgroundPath = path.join(__dirname, '..', 'src', 'background.ts');
  const contents = fs.readFileSync(backgroundPath, 'utf8');

  assert.match(contents, /try\s*\{\s*streamPort\.postMessage/);
  assert.match(contents, /try\s*\{\s*native\.postMessage/);
});
