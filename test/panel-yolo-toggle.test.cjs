const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel runtime row includes YOLO mode toggle', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /role=\"switch\"/);
  assert.match(contents, /YOLO/);
  assert.match(contents, /Safe/);
  assert.match(contents, /claudeYoloMode/);
});

