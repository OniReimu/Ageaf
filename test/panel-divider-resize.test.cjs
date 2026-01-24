const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel divider handle supports drag-to-resize without toggling', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /ageaf-panel__divider[\s\S]*onMouseDown={onResizeStart}/,
    'divider should wire an onMouseDown resize handler'
  );

  assert.match(
    contents,
    /ageaf-panel__divider-toggle[\s\S]*onClick={onTogglePanel}/,
    'toggle icon should click to collapse/expand'
  );

  assert.match(
    contents,
    /ageaf-panel__divider-toggle[\s\S]*stopPropagation/,
    'toggle icon should not start resize drag'
  );
});
