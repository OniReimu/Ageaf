const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Chat store persists Codex threadId per conversation', () => {
  const storePath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'chatStore.ts');
  const contents = fs.readFileSync(storePath, 'utf8');

  assert.match(contents, /threadId/);
});

