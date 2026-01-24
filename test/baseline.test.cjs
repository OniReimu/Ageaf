const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('package.json defines an npm test script', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.equal(typeof pkg.scripts?.test, 'string');
  assert.ok(pkg.scripts.test.length > 0);
});
