const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('content script apply bridge times out unresolved apply requests', () => {
  const scriptPath = path.join(__dirname, '..', 'src', 'iso', 'contentScript.ts');
  const contents = fs.readFileSync(scriptPath, 'utf8');

  assert.match(contents, /const APPLY_REQUEST_TIMEOUT_MS\s*=\s*\d+/);
  assert.match(contents, /function createApplyRequest\(/);
  assert.match(contents, /setTimeout\([\s\S]*Timed out waiting for editor apply response/);
  assert.match(contents, /applyReplaceRange[\s\S]*createApplyRequest\(/);
  assert.match(contents, /applyReplaceInFile[\s\S]*createApplyRequest\(/);
});
