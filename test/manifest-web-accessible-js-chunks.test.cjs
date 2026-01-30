const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('manifest exposes async chunk JS for Overleaf', () => {
  const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const resources = manifest.web_accessible_resources || [];

  const matches = resources.flatMap((entry) => entry.resources || []);
  const hasVendorsJs = matches.some((resource) => resource === 'vendors-*.js' || resource === '*.js');

  assert.ok(hasVendorsJs, 'Expected manifest to expose vendor JS chunks');
});
