const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('ISO API client supports Codex runtime metadata', () => {
  const clientPath = path.join(__dirname, '..', 'src', 'iso', 'api', 'client.ts');
  const contents = fs.readFileSync(clientPath, 'utf8');

  assert.match(contents, /\/v1\/runtime\/codex\/metadata/);
});
