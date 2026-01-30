const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Markdown normalizes done fences and patch JSON output', () => {
  const markdownPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'markdown.ts');
  const contents = fs.readFileSync(markdownPath, 'utf8');

  assert.match(contents, /function\s+normalizeAssistantOutput/);
  assert.match(contents, /done/i);
  assert.match(contents, /replaceSelection/);
  assert.match(contents, /insertAtCursor/);
  assert.match(contents, /replaceRangeInFile/);
  assert.ok(contents.includes('ageaf[-_]?patch'));
  assert.match(contents, /JSON\.parse/);
  assert.match(contents, /normalizeTaskLists\(normalizeAssistantOutput/);
  assert.ok(!contents.includes('extractedPatchText'));
});
