const { test } = require('node:test');
const assert = require('node:assert');

// Import the registry functions (test exports)
const {
  searchSkills,
  stripFrontmatter,
} = require('../src/iso/panel/skills/skillsRegistry.test-exports.cjs');

test('searchSkills matches by name', () => {
  const skills = [
    { id: '1', name: 'langchain', description: 'Framework for LLMs', tags: [] },
    { id: '2', name: 'llamaindex', description: 'Data framework', tags: [] },
    { id: '3', name: 'vllm', description: 'Fast inference', tags: [] },
  ];

  const results = searchSkills(skills, 'lang');
  assert.strictEqual(results.length, 1, 'Should find 1 result');
  assert.strictEqual(results[0].name, 'langchain', 'Should find langchain');
});

test('searchSkills matches by description', () => {
  const skills = [
    { id: '1', name: 'skill1', description: 'Framework for agents', tags: [] },
    { id: '2', name: 'skill2', description: 'Data processing', tags: [] },
    { id: '3', name: 'skill3', description: 'Framework for RAG', tags: [] },
  ];

  const results = searchSkills(skills, 'framework');
  assert.strictEqual(results.length, 2, 'Should find 2 results');
});

test('searchSkills matches by tags', () => {
  const skills = [
    { id: '1', name: 'skill1', description: 'Test', tags: ['Agents', 'RAG'] },
    { id: '2', name: 'skill2', description: 'Test', tags: ['Data'] },
    { id: '3', name: 'skill3', description: 'Test', tags: ['RAG', 'Inference'] },
  ];

  const results = searchSkills(skills, 'rag');
  assert.strictEqual(results.length, 2, 'Should find 2 results with RAG tag');
});

test('searchSkills is case-insensitive', () => {
  const skills = [
    { id: '1', name: 'LangChain', description: 'Framework', tags: ['AGENTS'] },
  ];

  const results = searchSkills(skills, 'langchain');
  assert.strictEqual(results.length, 1, 'Should match case-insensitively');

  const results2 = searchSkills(skills, 'agents');
  assert.strictEqual(results2.length, 1, 'Should match tags case-insensitively');
});

test('searchSkills prioritizes exact prefix matches', () => {
  const skills = [
    { id: '1', name: 'vllm', description: 'Fast inference', tags: [] },
    { id: '2', name: 'serving-llms-vllm', description: 'vLLM server', tags: [] },
    { id: '3', name: 'other', description: 'Contains vllm in description', tags: [] },
  ];

  const results = searchSkills(skills, 'vllm');

  // Exact name match should come first
  assert.strictEqual(results[0].name, 'vllm', 'Exact match should be first');

  // Prefix match should come second
  assert.ok(
    results[1].name.startsWith('serving') || results[1].description.includes('vllm'),
    'Prefix or substring matches should follow'
  );
});

test('searchSkills returns empty array for no matches', () => {
  const skills = [
    { id: '1', name: 'skill1', description: 'Test', tags: [] },
  ];

  const results = searchSkills(skills, 'nonexistent');
  assert.strictEqual(results.length, 0, 'Should return empty array');
});

test('searchSkills returns all skills for empty query', () => {
  const skills = [
    { id: '1', name: 'skill1', description: 'Test', tags: [] },
    { id: '2', name: 'skill2', description: 'Test', tags: [] },
  ];

  const results = searchSkills(skills, '');
  assert.strictEqual(results.length, 2, 'Should return all skills for empty query');
});

test('stripFrontmatter removes YAML frontmatter', () => {
  const markdown = `---
name: test-skill
description: A test skill
tags: [Test, Example]
---

# Skill Content

This is the actual content.`;

  const stripped = stripFrontmatter(markdown);
  assert.ok(!stripped.includes('---'), 'Should not contain frontmatter delimiters');
  assert.ok(!stripped.includes('name: test-skill'), 'Should not contain frontmatter fields');
  assert.ok(stripped.includes('# Skill Content'), 'Should contain actual content');
});

test('stripFrontmatter handles markdown without frontmatter', () => {
  const markdown = `# Skill Content

This is content without frontmatter.`;

  const stripped = stripFrontmatter(markdown);
  assert.strictEqual(stripped, markdown, 'Should return original if no frontmatter');
});
