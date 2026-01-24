const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('ISO API client JobPayload includes Codex runtime config', () => {
  const clientPath = path.join(__dirname, '..', 'src', 'iso', 'api', 'client.ts');
  const contents = fs.readFileSync(clientPath, 'utf8');

  assert.match(contents, /provider:\s*'claude'\s*\|\s*'codex'/);
  assert.match(contents, /runtime\?:\s*\{\s*claude\?:/);
  assert.match(contents, /codex\?:\s*\{/);
  assert.match(contents, /approvalPolicy\?:/);
  assert.match(contents, /model\?:/);
  assert.match(contents, /reasoningEffort\?:/);
  assert.match(contents, /threadId\?:/);
});
