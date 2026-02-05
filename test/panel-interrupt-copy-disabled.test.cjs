const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Interrupted-by-user marker is not copyable as a response', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /stripInterruptedByUserSuffix\(message\.content\)/);
  assert.match(contents, /copyToClipboard\(\s*copyResponseText\s*\)/);
  assert.match(contents, /canCopyResponse/);
});
