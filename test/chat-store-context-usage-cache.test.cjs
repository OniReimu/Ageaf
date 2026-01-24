const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Chat store supports persisting last-known context usage per conversation', () => {
  const storePath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'chatStore.ts');
  const contents = fs.readFileSync(storePath, 'utf8');

  assert.match(contents, /lastUsage/);
  assert.match(contents, /updatedAt/);
  assert.match(contents, /setConversationContextUsage/);
});

