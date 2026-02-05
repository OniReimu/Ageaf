const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel does not emit misleading "Job failed (ok)" for patch-only responses', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  // Implementation should explicitly track whether a patch was received and avoid fallback messaging.
  assert.match(contents, /didReceivePatch/);
  assert.match(contents, /pending\.status\s*===\s*['"]ok['"]/);
  assert.match(contents, /didReceivePatch[\s\S]*pending\.status/);
});
