const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Options type includes showThinkingAndTools toggle', () => {
  const typesPath = path.join(__dirname, '..', 'src', 'types.ts');
  const contents = fs.readFileSync(typesPath, 'utf8');
  assert.match(contents, /showThinkingAndTools\?: boolean;/);
});

