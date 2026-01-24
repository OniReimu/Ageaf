const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel renders runtime controls row for model, thinking, and context', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-runtime/);
  assert.match(contents, /getSelectedModelLabel\(\)/);
  assert.match(contents, /ageaf-runtime__label">Thinking/);
});
