const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Messages render quoted/attachment content inside a collapsible quote container', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-message__quote/);
  assert.match(contents, /Attachment:/);
  assert.match(contents, /blockquote|BLOCKQUOTE/);
  assert.doesNotMatch(contents, /Show quote/);
  assert.doesNotMatch(contents, /Hide quote/);
  assert.doesNotMatch(contents, /wrapper\.appendChild\(element\.cloneNode/);
});

test('Quote container uses a constrained default height with scrolling', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(contents, /max-height:\s*160px/);
  assert.match(contents, /overflow-y:\s*auto/);
});

test('Message rendering uses the quote-aware renderer and stable ids', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /const renderMessageBubble = \(message: Message\) =>[\s\S]*renderMessageContent\(message,\s*latestPatchText\)/s
  );
  assert.match(
    contents,
    /messages\.slice\(0,\s*preStreamCount\)\.map\(renderMessageBubble\)/s
  );
  assert.match(contents, /key=\{message\.id\}/);
});
