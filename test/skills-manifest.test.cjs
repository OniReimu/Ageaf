const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Import the generator function (will be created next)
const { generateSkillsManifest } = require('../scripts/generate-skills-manifest.cjs');

test('generateSkillsManifest creates valid manifest', async () => {
  const skillsDir = path.join(__dirname, '..', 'public', 'skills');
  const manifest = await generateSkillsManifest(skillsDir);

  // Verify structure
  assert.ok(manifest.version, 'manifest should have version');
  assert.ok(manifest.generatedAt, 'manifest should have generatedAt timestamp');
  assert.ok(Array.isArray(manifest.skills), 'manifest.skills should be an array');

  // Verify skill count (should have >50 skills from AI-research-SKILLs)
  assert.ok(
    manifest.skills.length > 50,
    `Expected >50 skills, got ${manifest.skills.length}`
  );

  // Verify LangChain skill exists
  const langchainSkill = manifest.skills.find((s) => s.name === 'langchain');
  assert.ok(langchainSkill, 'Should include langchain skill');
  assert.strictEqual(
    langchainSkill.source,
    'ai-research',
    'LangChain should be from ai-research source'
  );

  // Verify skill structure
  const firstSkill = manifest.skills[0];
  assert.ok(firstSkill.id, 'Skill should have id');
  assert.ok(firstSkill.name, 'Skill should have name');
  assert.ok(firstSkill.description, 'Skill should have description');
  assert.ok(Array.isArray(firstSkill.tags), 'Skill should have tags array');
  assert.ok(firstSkill.source, 'Skill should have source');
  assert.ok(firstSkill.path, 'Skill should have path');

  // Verify path format (should start with skills/ai-research/)
  assert.ok(
    firstSkill.path.startsWith('skills/ai-research/'),
    `Path should start with skills/ai-research/, got: ${firstSkill.path}`
  );

  // Verify path ends with SKILL.md
  assert.ok(
    firstSkill.path.endsWith('/SKILL.md'),
    `Path should end with /SKILL.md, got: ${firstSkill.path}`
  );
});

test('generateSkillsManifest handles skills with YAML frontmatter', async () => {
  const skillsDir = path.join(__dirname, '..', 'public', 'skills');
  const manifest = await generateSkillsManifest(skillsDir);

  // Find a skill we know has frontmatter (e.g., vllm)
  const vllmSkill = manifest.skills.find((s) => s.id.includes('vllm'));
  assert.ok(vllmSkill, 'Should find vllm skill');
  assert.ok(vllmSkill.description, 'vLLM should have description from frontmatter');
  assert.ok(vllmSkill.tags.length > 0, 'vLLM should have tags from frontmatter');
});

test('generateSkillsManifest creates stable IDs', async () => {
  const skillsDir = path.join(__dirname, '..', 'public', 'skills');
  const manifest1 = await generateSkillsManifest(skillsDir);
  const manifest2 = await generateSkillsManifest(skillsDir);

  // IDs should be stable across runs
  assert.deepStrictEqual(
    manifest1.skills.map((s) => s.id),
    manifest2.skills.map((s) => s.id),
    'IDs should be stable across multiple runs'
  );
});
