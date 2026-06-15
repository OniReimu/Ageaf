import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadSkillsManifest,
  buildSkillsGuidance,
  findSkillByName,
} from '../src/runtimes/pi/skills.js';

test('loadSkillsManifest returns a valid manifest with skills', () => {
  const manifest = loadSkillsManifest();
  assert.ok(manifest, 'manifest should be loaded');
  assert.ok(manifest.version >= 1, 'manifest should have version >= 1');
  assert.ok(Array.isArray(manifest.skills), 'manifest.skills should be an array');
  assert.ok(manifest.skills.length > 0, 'manifest should contain at least one skill');
});

test('buildSkillsGuidance generates guidance from manifest', () => {
  const manifest = loadSkillsManifest();
  const guidance = buildSkillsGuidance(manifest);
  assert.ok(guidance.length > 0, 'guidance should be non-empty');
  assert.match(guidance, /Available Skills/i, 'guidance should mention Available Skills');
});

test('findSkillByName finds a skill by name prefix', () => {
  const manifest = loadSkillsManifest();
  // Assume at least one skill exists
  const firstSkill = manifest.skills[0]!;
  const found = findSkillByName(manifest, firstSkill.name);
  assert.ok(found, 'should find a skill');
  assert.equal(found!.name, firstSkill.name, 'found skill should match');
});

test('findSkillByName returns null for non-existent skill', () => {
  const manifest = loadSkillsManifest();
  const found = findSkillByName(manifest, 'nonexistent-skill-12345');
  assert.equal(found, null, 'should return null for non-existent skill');
});
