const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Main editor bridge registers Ageaf events', () => {
  const bridgePath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'editorBridge',
    'bridge.ts'
  );
  const contents = fs.readFileSync(bridgePath, 'utf8');

  assert.match(contents, /registerEditorBridge/);
  assert.match(contents, /ageaf:editor:request/);
  assert.match(contents, /ageaf:editor:response/);
  assert.match(contents, /ageaf:editor:replace/);
  assert.match(contents, /ageaf:editor:insert/);
});
