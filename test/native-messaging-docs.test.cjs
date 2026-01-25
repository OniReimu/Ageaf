const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('native messaging docs exist', () => {
  const docPath = path.join(__dirname, '..', 'docs', 'native-messaging.md');
  assert.ok(fs.existsSync(docPath));
});
