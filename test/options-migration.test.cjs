const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('helper.ts strips legacy auth keys from Options', () => {
  const helperPath = path.join(__dirname, '..', 'src', 'utils', 'helper.ts');
  const contents = fs.readFileSync(helperPath, 'utf8');

  // applyOptionDefaults must delete legacy fields
  assert.match(contents, /LEGACY_AUTH_KEYS/);
  assert.match(contents, /claudeCliPath/);
  assert.match(contents, /claudeEnvVars/);
  assert.match(contents, /claudeLoadUserSettings/);
  assert.match(contents, /openaiCodexCliPath/);
  assert.match(contents, /openaiEnvVars/);
  assert.match(contents, /hadLegacyKeys/);
});

test('getOptions auto-purges legacy keys from chrome.storage', () => {
  const helperPath = path.join(__dirname, '..', 'src', 'utils', 'helper.ts');
  const contents = fs.readFileSync(helperPath, 'utf8');

  // getOptions must write back when legacy keys are detected
  assert.match(contents, /if\s*\(hadLegacyKeys\)/);
  assert.match(contents, /chrome\.storage\.local\.set/);
});

test('Options type does not contain legacy auth fields', () => {
  const typesPath = path.join(__dirname, '..', 'src', 'types.ts');
  const contents = fs.readFileSync(typesPath, 'utf8');

  assert.doesNotMatch(contents, /claudeCliPath/);
  assert.doesNotMatch(contents, /claudeEnvVars/);
  assert.doesNotMatch(contents, /claudeLoadUserSettings/);
  assert.doesNotMatch(contents, /openaiCodexCliPath/);
  assert.doesNotMatch(contents, /openaiEnvVars/);
});
