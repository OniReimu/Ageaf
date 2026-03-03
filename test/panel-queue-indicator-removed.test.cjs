const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel no longer renders bottom-right queue status chip', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.doesNotMatch(contents, /class=\"ageaf-panel__queue\"/);
  assert.doesNotMatch(contents, /isSending \? 'Sending…' : 'Queued'/);
});

test('Panel CSS no longer defines queue status chip style', () => {
  const cssPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'panel.css'
  );
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.doesNotMatch(contents, /\.ageaf-panel__queue\s*\{/);
});
