const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel shows an active provider indicator', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-provider/);
  assert.match(contents, />\s*Anthropic\s*</);
  assert.match(contents, />\s*OpenAI\s*</);
});
