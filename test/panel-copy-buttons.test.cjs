const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Assistant responses include copy buttons for quotes and full response', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-message__copy/);
  assert.match(contents, /ageaf-message__copy-response/);
  assert.match(contents, /Copy response/);
  assert.match(contents, /ageaf-message__copy-check/);
});

test('Quote copy extraction uses markdown parsing and attachment label detection', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /extractQuoteCopyFromMarkdown/);
  assert.match(contents, /parseMarkdown/);
  assert.match(contents, /ATTACHMENT_LABEL_REGEX/);
});

test('Copy response action is left-aligned', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(contents, /ageaf-message__response-actions/);
  assert.match(contents, /justify-content:\s*flex-start/);
});
