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

  assert.match(contents, /user-select:\s*text/);
  assert.match(contents, /-webkit-user-select:\s*text/);
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

test('Inline overlay uses mark decoration for old text (not replace)', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  // Old text should use Decoration.mark() so it stays in the document and is
  // natively selectable/copyable by the browser.
  assert.match(
    contents,
    /Decoration\.mark\(\s*\{\s*class:\s*'ageaf-inline-diff-mark-old'/,
    'expected Decoration.mark() for old text range'
  );

  // The mark CSS class should exist with strikethrough styling.
  assert.match(
    contents,
    /\.ageaf-inline-diff-mark-old\s*\{[^}]*text-decoration:\s*line-through/,
    'expected mark class with strikethrough'
  );
});

test('Inline overlay widget stops mousedown propagation for textarea interaction', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  assert.match(
    contents,
    /addEventListener\('mousedown'[\s\S]*?stopPropagation/,
    'expected mousedown stopPropagation on widget wrapper'
  );
});

test('Inline overlay widgets keep DOM events for native selection/editing', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  const matches =
    contents.match(/ignoreEvent\(\)\s*\{[\s\S]*?return\s+true;\s*\}/g) ?? [];
  assert.ok(
    matches.length >= 2,
    'expected both widget ignoreEvent implementations to return true'
  );
});

test('Inline overlay avoids redundant widget dispatch churn', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  assert.match(
    contents,
    /lastWidgetPayloadSignature/,
    'expected a widget payload signature cache'
  );
  assert.match(
    contents,
    /if\s*\(\s*overlayWidgetView === view\s*&&\s*lastWidgetPayloadSignature === nextSignature\s*\)\s*\{\s*return;\s*\}/m,
    'expected redundant widget dispatch guard'
  );
});
