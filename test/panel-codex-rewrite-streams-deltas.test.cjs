const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Codex rewrite streams deltas (non-chat actions)', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /if\s*\(action\s*!==\s*'chat'\)\s*\{/);
  assert.match(contents, /if\s*\(provider\s*===\s*'codex'\)\s*\{\s*\n\s*enqueueStreamTokens/);
});
