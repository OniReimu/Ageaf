const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Attachment chips in transcript have hover preview from hidden blocks', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /data-attachment-preview/,
    'expected transcript attachment preview propagation'
  );

  const start = contents.indexOf('const createAttachmentChip');
  assert.ok(start >= 0, 'expected createAttachmentChip');
  const end = contents.indexOf('const createMentionChip', start);
  assert.ok(end >= 0, 'expected createMentionChip');
  const section = contents.slice(start, end);
  assert.match(section, /chip\.title\s*=/, 'expected attachment chips to set title');
});

