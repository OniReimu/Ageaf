const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('ISO API client supports Codex runtime metadata', () => {
  const httpClientPath = path.join(__dirname, '..', 'src', 'iso', 'api', 'httpClient.ts');
  const contents = fs.readFileSync(httpClientPath, 'utf8');

  assert.match(contents, /\/v1\/runtime\/codex\/metadata/);
});
