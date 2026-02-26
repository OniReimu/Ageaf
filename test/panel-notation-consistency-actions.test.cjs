const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel merges notation pass with draft fixes into one action', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /Notation consistency pass/);
  assert.match(
    contents,
    /sendMessage\([\s\S]*'Notation consistency pass[\s\S]*'notation_draft_fixes'[\s\S]*\)/
  );
  assert.doesNotMatch(contents, /Draft notation fixes/);
});
