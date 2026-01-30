const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('content iso script sets webpack public path for async chunks', () => {
  const entryPath = path.join(__dirname, '..', 'src', 'iso', 'contentScript.ts');
  const entry = fs.readFileSync(entryPath, 'utf8');

  assert.match(entry, /webpackPublicPath/);
});

test('webpack public path helper exists and uses chrome runtime URL', () => {
  const helperPath = path.join(__dirname, '..', 'src', 'iso', 'webpackPublicPath.ts');
  assert.ok(fs.existsSync(helperPath), 'Expected webpackPublicPath helper file to exist');

  const helper = fs.readFileSync(helperPath, 'utf8');
  assert.match(helper, /__webpack_public_path__/);
  assert.match(helper, /getURL/);
});
