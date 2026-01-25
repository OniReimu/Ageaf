const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('transport abstraction exists for native messaging', () => {
  const transportPath = path.join(__dirname, '..', 'src', 'iso', 'messaging', 'transport.ts');
  const contents = fs.readFileSync(transportPath, 'utf8');

  assert.match(contents, /createTransport/);
  assert.match(contents, /native/);
  assert.match(contents, /http/);
});
