const { test } = require('node:test');
const assert = require('node:assert');

// Import directive extraction functions
const {
  extractSkillDirectives,
  stripSkillDirectives,
} = require('../src/iso/panel/skills/skillDirectives.test-exports.cjs');

test('extractSkillDirectives finds single directive', () => {
  const text = 'Please help with /langchain integration';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 1, 'Should find 1 directive');
  assert.strictEqual(directives[0], 'langchain', 'Should extract langchain');
});

test('extractSkillDirectives finds multiple directives', () => {
  const text = 'Use /langchain and /vllm for this task';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 2, 'Should find 2 directives');
  assert.ok(directives.includes('langchain'), 'Should include langchain');
  assert.ok(directives.includes('vllm'), 'Should include vllm');
});

test('extractSkillDirectives deduplicates directives', () => {
  const text = 'Use /langchain and /langchain again';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 1, 'Should deduplicate');
  assert.strictEqual(directives[0], 'langchain', 'Should have langchain once');
});

test('extractSkillDirectives handles directive at start', () => {
  const text = '/langchain help me with this';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 1, 'Should find directive at start');
  assert.strictEqual(directives[0], 'langchain');
});

test('extractSkillDirectives allows whitespace after slash', () => {
  const text = '/ langchain help me with this';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 1, 'Should find directive with whitespace');
  assert.strictEqual(directives[0], 'langchain');
});

test('extractSkillDirectives handles directive at end', () => {
  const text = 'Please help with /langchain';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 1, 'Should find directive at end');
  assert.strictEqual(directives[0], 'langchain');
});

test('extractSkillDirectives ignores URLs', () => {
  const text = 'Check https://example.com/path for info';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 0, 'Should not match URLs');
});

test('extractSkillDirectives ignores file paths', () => {
  const text = 'See path/to/file.txt for details';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 0, 'Should not match file paths');
});

test('extractSkillDirectives handles hyphens and dots', () => {
  const text = 'Use /skill-name and /skill.name';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 2, 'Should find both');
  assert.ok(directives.includes('skill-name'), 'Should include hyphenated');
  assert.ok(directives.includes('skill.name'), 'Should include dotted');
});

test('extractSkillDirectives returns empty array for no directives', () => {
  const text = 'No skills here';
  const directives = extractSkillDirectives(text);
  assert.strictEqual(directives.length, 0, 'Should return empty array');
});

test('stripSkillDirectives removes single directive', () => {
  const text = 'Please help with /langchain integration';
  const stripped = stripSkillDirectives(text);
  assert.strictEqual(stripped, 'Please help with  integration', 'Should remove /langchain');
  assert.ok(!stripped.includes('/langchain'), 'Should not contain directive');
});

test('stripSkillDirectives removes multiple directives', () => {
  const text = 'Use /langchain and /vllm for this';
  const stripped = stripSkillDirectives(text);
  assert.ok(!stripped.includes('/langchain'), 'Should remove /langchain');
  assert.ok(!stripped.includes('/vllm'), 'Should remove /vllm');
  assert.ok(stripped.includes('Use'), 'Should keep other text');
  assert.ok(stripped.includes('and'), 'Should keep other text');
  assert.ok(stripped.includes('for this'), 'Should keep other text');
});

test('stripSkillDirectives preserves URLs', () => {
  const text = 'Check https://example.com/path and /langchain';
  const stripped = stripSkillDirectives(text);
  assert.ok(stripped.includes('https://example.com/path'), 'Should preserve URL');
  assert.ok(!stripped.includes('/langchain'), 'Should remove directive');
});

test('stripSkillDirectives handles directive at start', () => {
  const text = '/langchain help me';
  const stripped = stripSkillDirectives(text);
  assert.strictEqual(stripped, ' help me', 'Should remove directive at start');
});

test('stripSkillDirectives removes directive with whitespace after slash', () => {
  const text = '/ langchain help me';
  const stripped = stripSkillDirectives(text);
  assert.strictEqual(stripped, ' help me', 'Should remove directive at start with whitespace');
});

test('stripSkillDirectives handles directive at end', () => {
  const text = 'Please use /langchain';
  const stripped = stripSkillDirectives(text);
  assert.strictEqual(stripped, 'Please use ', 'Should remove directive at end');
});

test('stripSkillDirectives returns unchanged text with no directives', () => {
  const text = 'No skills here';
  const stripped = stripSkillDirectives(text);
  assert.strictEqual(stripped, text, 'Should return unchanged');
});
