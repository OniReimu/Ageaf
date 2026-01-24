const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Settings UI does not expose Claude session scope control', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.doesNotMatch(contents, /Claude session scope/);
  assert.doesNotMatch(contents, /ageaf-claude-session-scope/);
});

