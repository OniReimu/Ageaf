const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('content script applyReplaceRange returns typed promise', () => {
  const scriptPath = path.join(__dirname, '..', 'src', 'iso', 'contentScript.ts');
  const contents = fs.readFileSync(scriptPath, 'utf8');
  assert.match(contents, /applyReplaceRange[\s\S]*new Promise<\{\s*ok: boolean/);
  assert.match(contents, /applyReplaceInFile[\s\S]*new Promise<\{\s*ok: boolean/);
});
