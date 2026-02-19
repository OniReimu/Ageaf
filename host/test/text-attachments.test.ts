import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateAttachmentEntries,
  buildAttachmentBlock,
  getAttachmentLimits,
  ALLOWED_TEXT_EXTENSIONS,
} from '../src/attachments/textAttachments.js';

const limits = getAttachmentLimits();

test('.bib is an allowed text extension', () => {
  assert.ok(ALLOWED_TEXT_EXTENSIONS.includes('.bib'));
});

test('inline .bib content without path is accepted', async () => {
  const bibContent = '@article{foo,\n  title={Bar},\n  year={2024}\n}';
  const { attachments, errors } = await validateAttachmentEntries(
    [{ id: 'bib1', name: 'refs.bib', ext: '.bib', content: bibContent }],
    limits,
  );
  assert.equal(errors.length, 0);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].name, 'refs.bib');
  assert.equal(attachments[0].ext, '.bib');
  assert.equal(attachments[0].content, bibContent);
});

test('inline content with non-existent path falls through to content branch', async () => {
  const content = '@article{a, title={B}, year={2025}}';
  const { attachments, errors } = await validateAttachmentEntries(
    [{ id: 'bib2', path: 'overleaf/refs.bib', name: 'refs.bib', ext: '.bib', content }],
    limits,
  );
  assert.equal(errors.length, 0, `unexpected errors: ${errors.map((e) => e.message).join(', ')}`);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].content, content);
});

test('non-existent path without inline content returns error', async () => {
  const { attachments, errors } = await validateAttachmentEntries(
    [{ id: 'bib3', path: '/no/such/file.bib', name: 'missing.bib', ext: '.bib' }],
    limits,
  );
  assert.equal(attachments.length, 0);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].message.length > 0);
});

test('buildAttachmentBlock formats .bib inline content', async () => {
  const content = '@article{x, title={Y}, year={2024}}';
  const { block } = await buildAttachmentBlock(
    [{ id: 'bib4', name: 'refs.bib', ext: '.bib', content }],
    limits,
  );
  assert.ok(block.includes('[Attachments]'));
  assert.ok(block.includes('```bibtex'));
  assert.ok(block.includes(content));
  assert.ok(block.includes('[/Attachments]'));
});
