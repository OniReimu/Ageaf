import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseSkillFrontmatter,
  loadSkillsManifest,
  loadSkillRaw,
  findSkillByName,
} from '../src/runtimes/pi/skills.js';

test('parseSkillFrontmatter extracts allowed-tools from mermaid skill', () => {
  const manifest = loadSkillsManifest();
  const mermaidSkill = findSkillByName(manifest, 'mermaid');
  if (!mermaidSkill) {
    // Skip if mermaid skill doesn't exist in this environment
    return;
  }

  const raw = loadSkillRaw(mermaidSkill);
  assert.ok(raw.length > 0, 'should load mermaid skill content');

  const fm = parseSkillFrontmatter(raw);
  assert.ok(fm, 'should parse frontmatter');
  assert.ok(fm!.allowedTools, 'should have allowedTools');
  assert.ok(fm!.allowedTools!.includes('mcp__ageaf-mermaid__render_mermaid'),
    'should include render_mermaid tool');
  assert.ok(fm!.allowedTools!.includes('mcp__ageaf-mermaid__list_mermaid_themes'),
    'should include list_mermaid_themes tool');
});

test('parseSkillFrontmatter extracts allowed-tools from humanizer skill', () => {
  const manifest = loadSkillsManifest();
  const humanizerSkill = findSkillByName(manifest, 'humanizer');
  if (!humanizerSkill) {
    return;
  }

  const raw = loadSkillRaw(humanizerSkill);
  const fm = parseSkillFrontmatter(raw);
  assert.ok(fm, 'should parse frontmatter');
  assert.ok(fm!.allowedTools, 'should have allowedTools');
  assert.ok(fm!.allowedTools!.includes('Read'), 'should include Read');
  assert.ok(fm!.allowedTools!.includes('Write'), 'should include Write');
  assert.ok(fm!.allowedTools!.includes('Edit'), 'should include Edit');
});

test('parseSkillFrontmatter returns null for content without frontmatter', () => {
  const result = parseSkillFrontmatter('# Just a heading\nSome content');
  assert.equal(result, null, 'should return null for no frontmatter');
});

test('parseSkillFrontmatter returns null for empty string', () => {
  const result = parseSkillFrontmatter('');
  assert.equal(result, null, 'should return null for empty string');
});

test('parseSkillFrontmatter handles frontmatter without allowed-tools', () => {
  const raw = `---
name: test-skill
description: A test skill
---
# Content`;
  const fm = parseSkillFrontmatter(raw);
  assert.ok(fm, 'should parse frontmatter');
  assert.equal(fm!.allowedTools, undefined, 'should have no allowedTools');
});
