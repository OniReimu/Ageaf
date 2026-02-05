const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Inline diff overlay offers Feedback action', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  assert.match(contents, /Feedback/);
  assert.match(contents, /['"]feedback['"]/);
  assert.match(contents, /PANEL_ACTION_EVENT/);
});
