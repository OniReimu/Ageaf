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
  assert.ok(Array.isArray(manifest.skills), 'manifest.skills should be an array');

  // Verify bundled skill set:
  // - ai-research: 20-ml-paper-writing
  // - anthropic: doc-coauthoring
  // - custom: humanizer
  // - custom: paper-reviewer
  // - k-dense: citation-management
  assert.strictEqual(manifest.skills.length, 5, `Expected 5 skills, got ${manifest.skills.length}`);

  const paperSkill = manifest.skills.find((s) => s.name === 'ml-paper-writing');
  assert.ok(paperSkill, 'Should include ml-paper-writing skill');
  assert.strictEqual(
    paperSkill.source,
    'ai-research',
    'ml-paper-writing should be from ai-research source'
  );

  const docSkill = manifest.skills.find((s) => s.name === 'doc-coauthoring');
  assert.ok(docSkill, 'Should include doc-coauthoring skill');
  assert.strictEqual(docSkill.source, 'anthropic', 'doc-coauthoring should be from anthropic source');

  const reviewerSkill = manifest.skills.find((s) => s.name === 'paper-reviewer');
  assert.ok(reviewerSkill, 'Should include paper-reviewer skill');
  assert.strictEqual(reviewerSkill.source, 'custom', 'paper-reviewer should be from custom source');

  const humanizerSkill = manifest.skills.find((s) => s.name === 'humanizer');
  assert.ok(humanizerSkill, 'Should include humanizer skill');
  assert.strictEqual(humanizerSkill.source, 'custom', 'humanizer should be from custom source');

  const citationSkill = manifest.skills.find((s) => s.name === 'citation-management');
  assert.ok(citationSkill, 'Should include citation-management skill');
  assert.strictEqual(citationSkill.source, 'k-dense', 'citation-management should be from k-dense source');

  // Verify skill structure
  const firstSkill = manifest.skills[0];
  assert.ok(firstSkill.id, 'Skill should have id');
  assert.ok(firstSkill.name, 'Skill should have name');
  assert.ok(firstSkill.description, 'Skill should have description');
  assert.ok(Array.isArray(firstSkill.tags), 'Skill should have tags array');
  assert.ok(firstSkill.source, 'Skill should have source');
  assert.ok(firstSkill.path, 'Skill should have path');

  // Verify path format (should start with skills/)
  assert.ok(firstSkill.path.startsWith('skills/'), `Path should start with skills/, got: ${firstSkill.path}`);

  // Verify path ends with SKILL.md
  assert.ok(
    firstSkill.path.endsWith('/SKILL.md'),
    `Path should end with /SKILL.md, got: ${firstSkill.path}`
  );
});

test('generateSkillsManifest handles skills with YAML frontmatter', async () => {
  const skillsDir = path.join(__dirname, '..', 'public', 'skills');
  const manifest = await generateSkillsManifest(skillsDir);

  // Find the ml-paper-writing skill (known to have frontmatter)
  const paperSkill = manifest.skills.find((s) => s.name === 'ml-paper-writing');
  assert.ok(paperSkill, 'Should find ml-paper-writing skill');
  assert.ok(paperSkill.description, 'ml-paper-writing should have description from frontmatter');
  assert.ok(paperSkill.tags.length > 0, 'ml-paper-writing should have tags from frontmatter');
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
