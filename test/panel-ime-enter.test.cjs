const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel does not send on Enter while IME composition is active', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.ok(contents.includes('event.isComposing'));
  assert.ok(contents.includes('isComposingRef.current'));
  assert.match(contents, /compositionKeyCode\s*=\s*229/);
});
