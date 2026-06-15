const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('New chat provider menu enables BYOK/Pi selection', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /onClick=\{\(\) => (void )?onNewChat\('pi'\)\}/);
  assert.match(contents, />\s*BYOK\s*</);
});
