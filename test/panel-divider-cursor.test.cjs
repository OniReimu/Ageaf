const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Divider uses resize cursor except on toggle icon', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(
    contents,
    /\.ageaf-panel__divider\s*{[\s\S]*cursor:\s*col-resize/,
    'divider should show a horizontal resize cursor'
  );

  assert.match(
    contents,
    /\.ageaf-panel__divider-toggle\s*{[\s\S]*cursor:\s*pointer/,
    'toggle icon should show pointer cursor'
  );
});

