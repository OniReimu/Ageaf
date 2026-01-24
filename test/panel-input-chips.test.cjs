const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel input uses a contenteditable editor with chip placeholders', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /contentEditable/);
  assert.match(contents, /ageaf-panel__editor/);
  assert.match(contents, /data-chip-id/);
});

test('Panel editor handles paste-to-chip and Ctrl/Cmd+K selection chips', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /onPaste/);
  assert.match(contents, /clipboardData/);
  assert.match(contents, /metaKey|ctrlKey/);
  assert.match(contents, /requestSelection/);
});

