const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Rewrite selection is available for Codex provider', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.doesNotMatch(contents, /Rewrite selection is only available with the Anthropic provider/i);
  assert.doesNotMatch(contents, /chatProvider\s*!==\s*'claude'/);
});

