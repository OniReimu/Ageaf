const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('gitignore excludes planning artifacts', () => {
  const gitignorePath = path.join(__dirname, '..', '.gitignore');
  const contents = fs.readFileSync(gitignorePath, 'utf8');

  assert.match(contents, /^progress\.md$/m);
  assert.match(contents, /^findings\.md$/m);
  assert.match(contents, /^task_plan\.md$/m);
});
