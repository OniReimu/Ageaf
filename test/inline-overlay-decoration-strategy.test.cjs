const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Replacement hunks use Decoration.replace, not block widgets', () => {
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

  // 1. Decoration.replace({ widget }) exists in the overlay update path
  assert.ok(
    stateFieldBlock.includes('Decoration.replace('),
    'expected Decoration.replace() for replacement hunks'
  );

  // 2. Decoration.widget with block: true is only in the else branch (insertion path),
  //    NOT alongside Decoration.mark
  assert.ok(
    stateFieldBlock.includes('Decoration.widget('),
    'expected Decoration.widget() for insertion hunks'
  );

  // 3. Decoration.mark({ class: 'ageaf-inline-diff-old-mark' }) does NOT appear
  //    in the StateField update block (removed)
  assert.ok(
    !stateFieldBlock.includes('Decoration.mark('),
    'Decoration.mark should not appear in StateField update — old marks replaced by Decoration.replace'
  );
  assert.ok(
    !stateFieldBlock.includes('ageaf-inline-diff-old-mark'),
    'ageaf-inline-diff-old-mark class should not appear in StateField update'
  );
});
