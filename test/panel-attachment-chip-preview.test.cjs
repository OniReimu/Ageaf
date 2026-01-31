const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Attachment chips include a hover preview to reduce accidental clipboard leaks', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /const preview = \(\(\) => \{/);
  assert.match(contents, /chip\.title\s*=\s*preview/);
});

test('Attachment code blocks are hidden in the transcript UI', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  // Keep attachment bodies hidden in the transcript UI (chips already indicate they exist).
  assert.match(contents, /Hide the following code block in the transcript UI/);
  assert.match(contents, /i = nextIndex/);
});
