const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Claude runtime metadata uses simplified model labels and descriptions', () => {
  const metadataPath = path.join(
    __dirname,
    '..',
    'host',
    'src',
    'runtimes',
    'claude',
    'metadata.ts'
  );
  const contents = fs.readFileSync(metadataPath, 'utf8');

  assert.match(contents, /displayName:\s*'Sonnet'/);
  assert.match(contents, /displayName:\s*'Opus'/);
  assert.match(contents, /displayName:\s*'Haiku'/);
  assert.match(contents, /description:\s*'Best for everyday task'/);
  assert.match(contents, /description:\s*'Most capable for complex work'/);
  assert.match(contents, /description:\s*'Fastest for quick answers'/);
});
