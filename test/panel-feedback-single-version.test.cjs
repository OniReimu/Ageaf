const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Feedback requests consume at most one patch response to prevent multiple rewrite versions', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /const startedWithPatchFeedbackTarget = Boolean\(patchFeedbackTargetActive\);/);
  assert.match(contents, /let patchFeedbackResponseHandled = false;/);

  const patchStart = contents.indexOf("if (event.event === 'patch')");
  assert.ok(patchStart >= 0, 'expected patch event handler');
  const patchEnd = contents.indexOf("if (event.event === 'done')", patchStart);
  assert.ok(patchEnd > patchStart, 'expected end of patch event handler');
  const patchSection = contents.slice(patchStart, patchEnd);

  assert.match(
    patchSection,
    /if \(startedWithPatchFeedbackTarget && patchFeedbackResponseHandled\) \{\s*return;\s*\}/s
  );
  assert.match(
    patchSection,
    /patchFeedbackResponseHandled = true;/
  );
});
