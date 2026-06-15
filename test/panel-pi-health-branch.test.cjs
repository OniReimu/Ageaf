const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Pi health check reads healthData.pi?.configured (does not fallback to codex)', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  // Should have an explicit pi health branch
  assert.match(
    contents,
    /chatProvider\s*===\s*['"]pi['"]/,
    'checkConnectionHealth should have explicit pi branch'
  );
  assert.match(
    contents,
    /healthData\?\.pi\?\.configured/,
    'Pi health check should read healthData.pi?.configured'
  );
});
