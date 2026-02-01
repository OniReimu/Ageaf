const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('insertAtCursor patches render as code blocks (no review card)', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const patchStart = contents.indexOf("if (event.event === 'patch')");
  assert.ok(patchStart >= 0, 'expected patch event handler');
  const patchEnd = contents.indexOf("if (event.event === 'done')", patchStart);
  assert.ok(patchEnd >= 0, 'expected done handler after patch handler');
  const patchHandler = contents.slice(patchStart, patchEnd);

  // We still handle insertAtCursor patches (they can be emitted by runtimes),
  // but they should not become a "Review changes" card.
  assert.match(patchHandler, /patch\.kind === 'insertAtCursor'/);
  assert.doesNotMatch(patchHandler, /kind:\s*'insertAtCursor'/);

  // Instead, format the proposed text as a fenced code block in an assistant message.
  assert.match(patchHandler, /getSafeMarkdownFence/);
  assert.match(patchHandler, /role:\s*'assistant'/);
});
