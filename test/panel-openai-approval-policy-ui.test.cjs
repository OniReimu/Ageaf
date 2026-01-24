const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Settings include OpenAI approval policy selector', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-openai-approval-policy/);
  assert.match(contents, /value=\"untrusted\"/);
  assert.match(contents, /value=\"on-request\"/);
  assert.match(contents, /value=\"on-failure\"/);
  assert.match(contents, /value=\"never\"/);
});

