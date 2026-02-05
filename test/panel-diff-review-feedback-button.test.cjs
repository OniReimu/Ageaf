const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Patch review card offers Feedback action', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /Feedback/);
  assert.match(contents, /onFeedback/);
  assert.match(contents, /patchFeedback/);
  assert.match(contents, /pendingPatchFeedbackTargetRef/);
  assert.match(contents, /patchFeedbackTargetActive/);
  assert.match(contents, /messageIndex/);
});
