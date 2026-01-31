const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Patch review cards are queued during streaming and inserted after the assistant message', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /pendingPatchReviewMessages/);

  const finalizeStart = contents.indexOf('const maybeFinalizeStream');
  assert.ok(finalizeStart >= 0, 'expected maybeFinalizeStream');
  const finalizeEnd = contents.indexOf('const startStreamTimer', finalizeStart);
  assert.ok(finalizeEnd >= 0, 'expected startStreamTimer after maybeFinalizeStream');
  const finalize = contents.slice(finalizeStart, finalizeEnd);
  assert.match(finalize, /pendingPatchReviewMessages/);
  assert.match(finalize, /updatedMessages\.push/);

  const patchStart = contents.indexOf("if (event.event === 'patch')");
  assert.ok(patchStart >= 0, 'expected patch event handler');
  const patchEnd = contents.indexOf("if (event.event === 'done')", patchStart);
  assert.ok(patchEnd >= 0, 'expected done handler after patch handler');
  const patchHandler = contents.slice(patchStart, patchEnd);
  assert.match(patchHandler, /pendingPatchReviewMessages/);
});

