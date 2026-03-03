const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Inline overlay provides copy controls and enforces red-readonly + green-editable', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  assert.match(contents, /user-select:\s*text;/);
  assert.match(contents, /-webkit-user-select:\s*text;/);
  assert.match(
    contents,
    /data-ageaf-old-readonly/,
    'expected explicit old/red readonly marker'
  );
  assert.match(
    contents,
    /data-ageaf-proposed-editor=\"1\"/,
    'expected green/proposed textarea editable marker'
  );
  assert.doesNotMatch(
    contents,
    /ageaf-inline-diff-copy-btn/,
    'expected no top-right copy button UX for inline diff'
  );
});

test('Inline overlay fallback accept uses edited textarea text', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  const sectionStart = contents.indexOf(
    "const added = document.createElement('div');"
  );
  assert.ok(sectionStart >= 0, 'expected fallback addition section');
  const sectionEnd = contents.indexOf('overlayRoot.appendChild(added);', sectionStart);
  assert.ok(sectionEnd >= 0, 'expected fallback addition section end');
  const section = contents.slice(sectionStart, sectionEnd);

  assert.match(
    section,
    /document\.createElement\('textarea'\)/,
    'expected fallback green text to be editable textarea'
  );
  assert.match(
    section,
    /emitOverlayAction\(\s*overlayState\.messageId,\s*'accept',\s*[\s\S]*value\s*\)/,
    'expected fallback accept to send edited textarea value'
  );
});
