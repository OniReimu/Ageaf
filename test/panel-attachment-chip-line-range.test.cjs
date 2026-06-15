const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');

function readPanel() {
  return fs.readFileSync(panelPath, 'utf8');
}

test('Attachment chip serialization preserves selected line range metadata', () => {
  const contents = readPanel();

  const helperStart = contents.indexOf('const getAttachmentLineMetadata =');
  assert.ok(helperStart >= 0, 'expected getAttachmentLineMetadata helper');
  const helperEnd = contents.indexOf('const getFenceLanguage =', helperStart);
  assert.ok(helperEnd >= 0, 'expected getFenceLanguage after metadata helper');
  const helperSection = contents.slice(helperStart, helperEnd);

  assert.match(
    helperSection,
    /lineFrom/,
    'expected attachment metadata helper to read lineFrom'
  );
  assert.match(
    helperSection,
    /lineTo/,
    'expected attachment metadata helper to read lineTo'
  );

  const serializerStart = contents.indexOf('const serializeChipPayload =');
  assert.ok(serializerStart >= 0, 'expected serializeChipPayload');
  const serializerEnd = contents.indexOf(
    'const serializeEditorContent =',
    serializerStart
  );
  assert.ok(
    serializerEnd >= 0,
    'expected serializeEditorContent after serializeChipPayload'
  );
  const serializerSection = contents.slice(serializerStart, serializerEnd);
  assert.match(
    serializerSection,
    /getAttachmentLineMetadata\(payload\)/,
    'expected serializer to include attachment line metadata'
  );
  assert.match(
    serializerSection,
    /lineMetadata/,
    'expected serialized attachment label to include metadata segment'
  );
});

test('Attachment chip label parser accepts optional line range metadata', () => {
  const contents = readPanel();
  const constantsStart = contents.indexOf('const ATTACHMENT_LABEL_REGEX');
  assert.ok(constantsStart >= 0, 'expected ATTACHMENT_LABEL_REGEX constant');
  const constantsEnd = contents.indexOf('const RING_CIRCUMFERENCE', constantsStart);
  assert.ok(constantsEnd >= 0, 'expected RING_CIRCUMFERENCE after label constants');
  const constantsSection = contents.slice(constantsStart, constantsEnd);

  assert.match(
    constantsSection,
    /ATTACHMENT_LABEL_INLINE_REGEX[\s\S]*\(\?:/,
    'expected inline attachment label regex to support optional metadata segments'
  );
  assert.match(
    constantsSection,
    /ATTACHMENT_LABEL_REGEX[\s\S]*\(\?:/,
    'expected strict attachment label regex to support optional metadata segments'
  );

  const decorateStart = contents.indexOf('const decorateAttachmentLabelsHtml =');
  assert.ok(decorateStart >= 0, 'expected decorateAttachmentLabelsHtml');
  const decorateEnd = contents.indexOf('const decorateMentionsHtml =', decorateStart);
  assert.ok(decorateEnd >= 0, 'expected decorateMentionsHtml after attachment labels');
  const decorateSection = contents.slice(decorateStart, decorateEnd);
  assert.match(
    decorateSection,
    /lineFrom = String\(m\[3\]/,
    'expected parser to extract optional lineFrom capture'
  );
  assert.match(
    decorateSection,
    /lineTo = String\(m\[4\]/,
    'expected parser to extract optional lineTo capture'
  );
  assert.match(
    decorateSection,
    /createAttachmentChip\(filename, lineLabel/,
    'expected parser to render transcript chips using range-aware labels'
  );
});
