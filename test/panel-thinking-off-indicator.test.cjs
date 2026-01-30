const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Thinking indicator respects thinking mode off', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.ok(contents.includes("currentThinkingMode !== 'off'"));
  assert.ok(contents.includes('Working') && contents.includes('ESC to interrupt'));
  assert.match(contents, /Thought for \$\{[A-Za-z_]+\}s/);
});
