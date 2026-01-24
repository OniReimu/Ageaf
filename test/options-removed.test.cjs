const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Options page removed from manifest', () => {
  const manifestPath = path.join(
    __dirname,
    '..',
    'public',
    'manifest.json'
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.ok(!manifest.options_page);
  if (manifest.web_accessible_resources && manifest.web_accessible_resources[0]) {
    const resources = manifest.web_accessible_resources[0].resources || [];
    assert.ok(!resources.includes('options.html'));
  }
});
