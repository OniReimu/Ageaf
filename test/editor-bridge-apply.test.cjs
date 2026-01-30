const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Main editor bridge supports apply request/response', () => {
  const bridgePath = path.join(__dirname, '..', 'src', 'main', 'editorBridge', 'bridge.ts');
  const contents = fs.readFileSync(bridgePath, 'utf8');
  assert.match(contents, /ageaf:editor:apply:request/);
  assert.match(contents, /ageaf:editor:apply:response/);
  assert.match(contents, /replaceInFile/);
  assert.match(contents, /filePath/);
});
