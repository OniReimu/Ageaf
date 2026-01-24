const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Session tabs support mixed providers without corrupting history', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /state\.providers\.claude/);
  assert.match(contents, /state\.providers\.codex/);

  assert.doesNotMatch(contents, /getOrderedSessionIds\(nextState, provider\)/);
  assert.doesNotMatch(contents, /findConversation\(state, chatProvider, conversationId\)/);
  assert.match(contents, /conversation\.provider/);
  assert.match(contents, /setChatProvider\(provider\)/);
});
