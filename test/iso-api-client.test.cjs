const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('ISO API client supports job creation and event streaming', () => {
  const clientPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'api',
    'client.ts'
  );
  const contents = fs.readFileSync(clientPath, 'utf8');

  assert.match(contents, /createJob/);
  assert.match(contents, /streamJobEvents/);
  assert.match(contents, /v1\/jobs/);
  assert.match(contents, /runtime\/claude\/context/);
  assert.match(contents, /signal/);
});
