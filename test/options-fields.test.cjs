const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Settings modal includes Ageaf host and Claude fields', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-transport-mode/);
  assert.match(contents, /ageaf-host-url/);
  assert.doesNotMatch(contents, /ageaf-pairing-token/);
  assert.match(contents, /ageaf-claude-cli/);
  assert.match(contents, /ageaf-claude-env/);
  assert.match(contents, /Anthropic/);
  assert.match(contents, /OpenAI/);
  assert.match(contents, /ageaf-codex-cli/);
  assert.match(contents, /ageaf-openai-env/);
  assert.doesNotMatch(contents, /ageaf-claude-session-scope/);
});
