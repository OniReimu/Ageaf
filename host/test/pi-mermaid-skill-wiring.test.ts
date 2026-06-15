import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initToolRuntime,
  getToolCatalog,
  shutdownToolRuntime,
} from '../src/runtimes/pi/toolRuntime.js';
import {
  loadSkillsManifest,
  findSkillByName,
  loadSkillRaw,
  parseSkillFrontmatter,
  buildSkillsGuidance,
} from '../src/runtimes/pi/skills.js';
import { buildPiSystemPrompt } from '../src/runtimes/pi/prompt.js';

test('mermaid skill allowed-tools are all present in tool catalog', async () => {
  await initToolRuntime();
  try {
    const catalog = getToolCatalog();
    const catalogNames = new Set(catalog.map((t) => t.name));

    const manifest = loadSkillsManifest();
    const mermaidSkill = findSkillByName(manifest, 'mermaid');
    if (!mermaidSkill) {
      // Skip if mermaid skill doesn't exist in this environment
      return;
    }

    const raw = loadSkillRaw(mermaidSkill);
    const fm = parseSkillFrontmatter(raw);
    assert.ok(fm, 'mermaid skill should have frontmatter');
    assert.ok(fm!.allowedTools, 'mermaid skill should have allowedTools');

    for (const toolName of fm!.allowedTools!) {
      assert.ok(
        catalogNames.has(toolName),
        `tool "${toolName}" from mermaid skill should be in catalog. Available: ${[...catalogNames].join(', ')}`,
      );
    }
  } finally {
    await shutdownToolRuntime();
  }
});

test('buildSkillsGuidance annotates mermaid skill with [tools available]', async () => {
  await initToolRuntime();
  try {
    const catalog = getToolCatalog();
    const activeToolNames = catalog.map((t) => t.name);
    const manifest = loadSkillsManifest();

    const guidance = buildSkillsGuidance(manifest, activeToolNames);

    // Mermaid skill should be annotated since its tools are all in the catalog
    const mermaidSkill = findSkillByName(manifest, 'mermaid');
    if (mermaidSkill) {
      assert.ok(
        guidance.includes('[tools available]'),
        'guidance should annotate mermaid skill with [tools available]',
      );
    }
  } finally {
    await shutdownToolRuntime();
  }
});

test('system prompt includes tool guidance', async () => {
  await initToolRuntime();
  try {
    const catalog = getToolCatalog();
    const activeToolNames = catalog.map((t) => t.name);
    const manifest = loadSkillsManifest();
    const skillsGuidance = buildSkillsGuidance(manifest, activeToolNames);

    const toolsGuidanceLines = [
      'Available tools:',
      ...catalog.map((t) => `- ${t.name}: ${t.description}`),
    ];
    const toolsGuidance = toolsGuidanceLines.join('\n');

    const prompt = buildPiSystemPrompt({
      action: 'chat',
      contextForPrompt: null,
      hasOverleafFileBlocks: false,
      hasSelection: false,
      greetingMode: false,
      runtimeNote: 'test',
      skillsGuidance,
      toolsGuidance,
    });

    assert.ok(
      prompt.includes('mcp__ageaf-mermaid__render_mermaid'),
      'prompt should mention render_mermaid tool',
    );
    assert.ok(
      prompt.includes('web_search'),
      'prompt should mention web_search tool',
    );
  } finally {
    await shutdownToolRuntime();
  }
});
