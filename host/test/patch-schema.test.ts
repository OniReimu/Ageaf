import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePatch } from '../src/validate.js';

test('validatePatch rejects invalid patches', () => {
  assert.throws(() => validatePatch(null), /Invalid patch/);
  assert.throws(
    () => validatePatch({ kind: 'replaceSelection' }),
    /Invalid patch/
  );
  assert.throws(
    () => validatePatch({ kind: 'unknown', text: 'x' }),
    /Invalid patch/
  );
});

test('validatePatch accepts replaceSelection', () => {
  const patch = validatePatch({ kind: 'replaceSelection', text: 'hello' });
  assert.deepEqual(patch, { kind: 'replaceSelection', text: 'hello' });
});

test('validatePatch accepts insertAtCursor', () => {
  const patch = validatePatch({ kind: 'insertAtCursor', text: 'hello' });
  assert.deepEqual(patch, { kind: 'insertAtCursor', text: 'hello' });
});
