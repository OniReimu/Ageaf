const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('tsconfig uses an ESM module target for webpack', () => {
  const configPath = path.join(__dirname, '..', 'tsconfig.json');
  const contents = fs.readFileSync(configPath, 'utf8');
  assert.match(contents, /"module"\s*:\s*"esnext"/);
  assert.match(contents, /"moduleResolution"\s*:\s*"node"/);
});
