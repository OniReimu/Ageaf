const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Options default Claude session scope is project', () => {
  const helperPath = path.join(__dirname, '..', 'src', 'utils', 'helper.ts');
  const contents = fs.readFileSync(helperPath, 'utf8');

  assert.match(contents, /claudeSessionScope/);
  assert.match(contents, /claudeSessionScope\s*=\s*'project'/);
});

