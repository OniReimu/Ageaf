const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Patch review card uses icon-only accept/reject buttons in panel header', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  // Match the patch review header action buttons specifically (class ageaf-panel__apply).
  assert.match(contents, /class=\"ageaf-panel__apply\"[\s\S]*>[\s\S]*✓/);
  assert.match(
    contents,
    /class=\"ageaf-panel__apply is-secondary\"[\s\S]*>[\s\S]*✕/
  );
});
