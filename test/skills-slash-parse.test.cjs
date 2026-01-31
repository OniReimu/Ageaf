const { test } = require('node:test');
const assert = require('node:assert');

// Import the slash parsing helper (test export)
const { getSlashQuery } = require('../src/iso/panel/skills/slashParser.test-exports.cjs');

test('getSlashQuery matches /skill at start of text', () => {
  const result = getSlashQuery('/lan', 4);
  assert.ok(result, 'Should match /lan');
  assert.strictEqual(result.query, 'lan');
  assert.strictEqual(result.start, 0);
  assert.strictEqual(result.end, 4);
});

test('getSlashQuery matches /skill after whitespace', () => {
  const result = getSlashQuery('hello /lang', 11);
  assert.ok(result, 'Should match /lang after space');
  assert.strictEqual(result.query, 'lang');
  assert.strictEqual(result.start, 6);
  assert.strictEqual(result.end, 11);
});

test('getSlashQuery matches /skill after opening brackets', () => {
  const result1 = getSlashQuery('test (/vllm', 11);
  assert.ok(result1, 'Should match after (');
  assert.strictEqual(result1.query, 'vllm');

  const result2 = getSlashQuery('test [/vllm', 11);
  assert.ok(result2, 'Should match after [');

  const result3 = getSlashQuery('test {/vllm', 11);
  assert.ok(result3, 'Should match after {');
});

test('getSlashQuery does NOT match URLs', () => {
  const result1 = getSlashQuery('https://example.com/path', 24);
  assert.strictEqual(result1, null, 'Should not match https:// URL');

  const result2 = getSlashQuery('http://site.com/page', 20);
  assert.strictEqual(result2, null, 'Should not match http:// URL');
});

test('getSlashQuery does NOT match file paths', () => {
  const result = getSlashQuery('path/to/file.txt', 16);
  assert.strictEqual(result, null, 'Should not match file path without token start');
});

test('getSlashQuery matches empty query', () => {
  const result = getSlashQuery('hello /', 7);
  assert.ok(result, 'Should match / with empty query');
  assert.strictEqual(result.query, '');
  assert.strictEqual(result.start, 6);
  assert.strictEqual(result.end, 7);
});

test('getSlashQuery matches query with allowed characters', () => {
  const result1 = getSlashQuery('/skill-name', 11);
  assert.ok(result1, 'Should match hyphen');
  assert.strictEqual(result1.query, 'skill-name');

  const result2 = getSlashQuery('/skill_name', 11);
  assert.ok(result2, 'Should match underscore');
  assert.strictEqual(result2.query, 'skill_name');

  const result3 = getSlashQuery('/skill.name', 11);
  assert.ok(result3, 'Should match dot');
  assert.strictEqual(result3.query, 'skill.name');
});

test('getSlashQuery returns null for invalid characters', () => {
  const result = getSlashQuery('/skill name', 11);
  assert.strictEqual(result, null, 'Should not match space in query');
});

test('getSlashQuery handles partial query correctly', () => {
  // When cursor is at position 5 in "/langchain", textBefore is "/lang"
  const result = getSlashQuery('/lang', 5);
  assert.ok(result, 'Should match partial query');
  assert.strictEqual(result.query, 'lang');
  assert.strictEqual(result.start, 0);
  assert.strictEqual(result.end, 5);
});
