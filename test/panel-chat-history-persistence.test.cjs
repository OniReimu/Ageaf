const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Chat history persists via chrome.storage.local', () => {
  const storePath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'chatStore.ts');
  const contents = fs.readFileSync(storePath, 'utf8');

  assert.match(contents, /ageaf-chat-v1:project:/);
  assert.match(contents, /chrome\.storage\.local\.get\(/);
  assert.match(contents, /chrome\.storage\.local\.set\(/);
});

test('Panel includes session tabs and chat action buttons', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /role=\"tablist\"/);
  assert.match(contents, /aria-label=\"Sessions\"/);
  assert.match(contents, /aria-label=\"New chat\"/);
  assert.match(contents, /aria-label=\"Clear chat\"/);
  assert.match(contents, /aria-label=\"Close session\"/);
  assert.match(contents, />\s*Anthropic\s*</);
  assert.match(contents, />\s*OpenAI\s*</);
});

test('Content script unmounts panel outside projects', () => {
  const contentScriptPath = path.join(__dirname, '..', 'src', 'iso', 'contentScript.ts');
  const contents = fs.readFileSync(contentScriptPath, 'utf8');

  assert.match(contents, /unmountPanel\(\);/);
});
