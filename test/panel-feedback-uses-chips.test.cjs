const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Feedback action prefills composer with chips (not full quoted blocks)', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  // Ensure the feedback handler exists and uses chip insertion.
  assert.match(contents, /onFeedbackPatchReviewMessage/);
  assert.match(
    contents,
    /onFeedbackPatchReviewMessage[\s\S]*insertChipFromText/
  );
});
