const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel handles plan tool lifecycle completion phases', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /phase === 'tool_start'/);
  assert.match(contents, /phase === 'tool_complete'/);
  assert.match(contents, /phase === 'compaction_complete'/);
  assert.match(contents, /phase === 'tool_error'/);
});
