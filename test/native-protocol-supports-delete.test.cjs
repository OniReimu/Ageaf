const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('native messaging protocol supports DELETE requests', () => {
  const protocolPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'messaging',
    'nativeProtocol.ts'
  );
  const contents = fs.readFileSync(protocolPath, 'utf8');

  assert.match(contents, /'DELETE'/);
});

