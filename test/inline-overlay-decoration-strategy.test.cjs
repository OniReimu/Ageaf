const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Replacement hunks use Decoration.mark + Decoration.widget for selectability', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  // Find the StateField update block (between "update(value" and the closing of the
  // overlayEffect handler). We look for the for-loop that iterates over list entries.
  const fieldStart = contents.indexOf('for (const entry of list)');
  assert.ok(fieldStart >= 0, 'expected entry iteration loop in StateField update');

  // Find the end of this loop block — look for the deco = Decoration.set(items, true)
  // line which comes right after the loop.
  const fieldEnd = contents.indexOf('deco = Decoration.set(items, true)', fieldStart);
  assert.ok(fieldEnd >= 0, 'expected Decoration.set after loop');

  const stateFieldBlock = contents.slice(fieldStart, fieldEnd);

  // 1. Decoration.mark() is used for old text so it stays in the document
  //    and remains natively selectable/copyable.
  assert.ok(
    stateFieldBlock.includes('Decoration.mark('),
    'expected Decoration.mark() for old text range (selectability)'
  );
  assert.ok(
    stateFieldBlock.includes('ageaf-inline-diff-mark-old'),
    'expected ageaf-inline-diff-mark-old class on mark decoration'
  );

  // 2. Decoration.widget with block: true is used for both replacement and
  //    insertion paths (proposed new text).
  assert.ok(
    stateFieldBlock.includes('Decoration.widget('),
    'expected Decoration.widget() for proposed text'
  );

  // 3. Decoration.replace() should NOT be used — it makes the widget atomic
  //    and prevents text selection inside it.
  assert.ok(
    !stateFieldBlock.includes('Decoration.replace('),
    'Decoration.replace should not appear — it prevents text selection'
  );
});
