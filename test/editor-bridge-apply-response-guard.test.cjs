const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('main editor bridge guards onApplyRequest with catch and always responds', () => {
  const bridgePath = path.join(__dirname, '..', 'src', 'main', 'editorBridge', 'bridge.ts');
  const contents = fs.readFileSync(bridgePath, 'utf8');

  assert.match(contents, /async function onApplyRequest\([\s\S]*try\s*\{/);
  assert.match(contents, /async function onApplyRequest\([\s\S]*catch \(err\)/);
  assert.match(
    contents,
    /async function onApplyRequest\([\s\S]*new CustomEvent\(APPLY_RESPONSE_EVENT, \{ detail: response \}\)/
  );
  assert.doesNotMatch(
    contents,
    /if \(typeof detail\.expectedOldText !== 'string' \|\| typeof detail\.text !== 'string'\) return/
  );
});
