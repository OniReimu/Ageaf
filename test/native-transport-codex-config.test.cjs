const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('native transport does not forward codex cliPath/envVars', () => {
  const transportPath = path.join(__dirname, '..', 'src', 'iso', 'messaging', 'nativeTransport.ts');
  const contents = fs.readFileSync(transportPath, 'utf8');

  assert.match(contents, /\/v1\/runtime\/codex\/metadata/);
  assert.doesNotMatch(contents, /openaiCodexCliPath/);
  assert.doesNotMatch(contents, /openaiEnvVars/);
});
