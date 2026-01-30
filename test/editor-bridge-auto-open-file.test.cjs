const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Main editor bridge attempts to open file for replaceInFile', () => {
  const bridgePath = path.join(__dirname, '..', 'src', 'main', 'editorBridge', 'bridge.ts');
  const contents = fs.readFileSync(bridgePath, 'utf8');
  assert.match(
    contents,
    /detail\.kind === 'replaceInFile'[\s\S]{0,1800}tryActivateFileByName/
  );
});
