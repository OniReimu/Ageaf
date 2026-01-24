const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Thinking mode picker does not render per-mode descriptions', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.ok(!contents.includes('Disable extra thinking tokens.'));
  assert.ok(!contents.includes('Up to ${formatTokenCount('));
});
