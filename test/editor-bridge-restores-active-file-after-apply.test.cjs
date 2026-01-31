const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Main editor bridge restores original tab after replaceInFile apply attempts', () => {
  const bridgePath = path.join(__dirname, '..', 'src', 'main', 'editorBridge', 'bridge.ts');
  const contents = fs.readFileSync(bridgePath, 'utf8');

  assert.match(contents, /function restoreActiveFile\(/);
  // Should be used in both file content reads and apply flows.
  assert.ok(contents.match(/restoreActiveFile\(/g)?.length >= 2);
});

