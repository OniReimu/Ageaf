const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Feedback quoting uses a single chip for prompt + current + proposed', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  const start = contents.indexOf('const onFeedbackPatchReviewMessage');
  assert.ok(start >= 0, 'expected onFeedbackPatchReviewMessage');
  const end = contents.indexOf('const onAcceptPatchReviewMessage', start);
  assert.ok(end >= 0, 'expected onAcceptPatchReviewMessage');
  const section = contents.slice(start, end);

  const matches = section.match(/insertChipFromText/g) ?? [];
  assert.equal(
    matches.length,
    1,
    'expected exactly one insertChipFromText call in feedback handler'
  );
  assert.doesNotMatch(section, /insertHiddenSerializeText/);
  assert.doesNotMatch(section, /insertFeedbackPromptChip/);
});

