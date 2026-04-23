const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel routes context assembly through contextPolicy helpers', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /from ['"]\.\/contextPolicy['"]/);
  assert.match(contents, /detectContextIntent\(/);
  assert.match(contents, /computeContextPolicy\(/);
  assert.match(contents, /buildContextPayload\(/);
});

test('Panel no longer hardcodes selection and surrounding fields inside sharedContext', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.doesNotMatch(
    contents,
    /selection:\s*selection\?\.selection\s*\?\?\s*''/
  );
  assert.doesNotMatch(
    contents,
    /surroundingBefore:\s*selection\?\.before\s*\?\?\s*''/
  );
  assert.doesNotMatch(
    contents,
    /surroundingAfter:\s*selection\?\.after\s*\?\?\s*''/
  );
});
