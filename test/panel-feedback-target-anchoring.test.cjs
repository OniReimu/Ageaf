const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Feedback patch responses anchor to the original review card and do not fall through to new patch cards', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /type PatchFeedbackTarget = \{[\s\S]*anchorKey: string;[\s\S]*\};/
  );
  assert.match(
    contents,
    /anchorKey:\s*getPatchFeedbackAnchorKey\(patchReview\),/
  );

  const patchStart = contents.indexOf("if (event.event === 'patch')");
  assert.ok(patchStart >= 0, 'expected patch event handler');
  const patchEnd = contents.indexOf("if (event.event === 'done')", patchStart);
  assert.ok(patchEnd > patchStart, 'expected end of patch event handler');
  const patchSection = contents.slice(patchStart, patchEnd);

  assert.match(
    patchSection,
    /getPatchFeedbackAnchorKey\(review\) ===[\s\S]*patchFeedbackTargetActive\.anchorKey/s
  );
  assert.match(
    patchSection,
    /Feedback response target missing; ignore to avoid creating a detached rewrite card\./
  );
  assert.doesNotMatch(
    patchSection,
    /Only apply feedback target once; fall through to the normal patch handling otherwise\./
  );
});
