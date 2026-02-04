const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('ISO API client delegates to transport abstraction', () => {
  const clientPath = path.join(__dirname, '..', 'src', 'iso', 'api', 'client.ts');
  const contents = fs.readFileSync(clientPath, 'utf8');

  // We want transport-aware behavior (HTTP vs native messaging) at the call site.
  assert.match(contents, /createTransport/);
  assert.match(contents, /export\s+async\s+function\s+createJob/);
  assert.match(contents, /export\s+async\s+function\s+streamJobEvents/);
  assert.match(contents, /export\s+async\s+function\s+fetchHostHealth/);
});
