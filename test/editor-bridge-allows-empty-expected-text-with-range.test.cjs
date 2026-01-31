const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Main editor bridge allows empty expectedOldText when from/to are provided', () => {
  const bridgePath = path.join(__dirname, '..', 'src', 'main', 'editorBridge', 'bridge.ts');
  const contents = fs.readFileSync(bridgePath, 'utf8');

  assert.match(contents, /const hasExplicitRange/);
  assert.match(contents, /!detail\.expectedOldText\s*&&\s*!hasExplicitRange/);
});
