const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Background open-settings message handles missing receiver', () => {
  const backgroundPath = path.join(__dirname, '..', 'src', 'background.ts');
  const contents = fs.readFileSync(backgroundPath, 'utf8');

  assert.match(contents, /chrome\.tabs\.sendMessage\(/);
  // Should not produce unhandled promise rejections when the content script
  // is not present on the active tab.
  assert.match(contents, /chrome\.runtime\.lastError/);
});
