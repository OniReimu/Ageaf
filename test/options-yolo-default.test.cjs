const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Options default YOLO mode is enabled', () => {
  const helperPath = path.join(__dirname, '..', 'src', 'utils', 'helper.ts');
  const contents = fs.readFileSync(helperPath, 'utf8');

  assert.ok(contents.includes('claudeYoloMode'));
  assert.ok(
    contents.includes('options.claudeYoloMode === undefined') &&
      contents.includes('options.claudeYoloMode = true')
  );
});
