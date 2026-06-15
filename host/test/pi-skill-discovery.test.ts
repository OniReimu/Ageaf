import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Helper: properly restore env vars (delete if originally unset, not set to "undefined")
function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

// ─── skills.ts unit tests ───

test('loadSkillsManifest dedupes discovered entries by name', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-test-'));
  const origSkillsDir = process.env.AGEAF_SKILLS_DIR;
  const origDiscoveredDir = process.env.AGEAF_DISCOVERED_SKILLS_DIR;

  try {
    const skillsDir = path.join(tmpDir, 'static');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'manifest.json'),
      JSON.stringify({ version: 1, skills: [{ id: 'my-skill', name: 'my-skill', description: 'Native skill', tags: [], path: 'my-skill/SKILL.md' }] }),
    );
    process.env.AGEAF_SKILLS_DIR = skillsDir;

    const discoveredDir = path.join(tmpDir, 'discovered');
    fs.mkdirSync(discoveredDir, { recursive: true });
    fs.writeFileSync(
      path.join(discoveredDir, 'discovered-manifest.json'),
      JSON.stringify({
        version: 1,
        skills: [
          { id: 'discovered/alpha-source/gantt-chart', name: 'gantt-chart', description: 'Gantt from alpha', tags: [], path: 'alpha-source/gantt-chart/SKILL.md', discoveredAt: '2026-01-01', trustLevel: 'community' },
          { id: 'discovered/beta-source/gantt-chart', name: 'gantt-chart', description: 'Gantt from beta', tags: [], path: 'beta-source/gantt-chart/SKILL.md', discoveredAt: '2026-01-02', trustLevel: 'community' },
          { id: 'discovered/gamma-source/unique-skill', name: 'unique-skill', description: 'Unique', tags: [], path: 'gamma-source/unique-skill/SKILL.md', discoveredAt: '2026-01-03', trustLevel: 'verified' },
        ],
      }),
    );
    process.env.AGEAF_DISCOVERED_SKILLS_DIR = discoveredDir;

    const { loadSkillsManifest } = await import('../src/runtimes/pi/skills.js');
    const manifest = loadSkillsManifest();

    const ganttEntries = manifest.skills.filter((s: any) => s.name === 'gantt-chart');
    assert.equal(ganttEntries.length, 1, 'should have exactly one gantt-chart (deduped)');
    assert.equal(ganttEntries[0].id, 'discovered/alpha-source/gantt-chart', 'first by id (alphabetical source) wins');

    const uniqueEntries = manifest.skills.filter((s: any) => s.name === 'unique-skill');
    assert.equal(uniqueEntries.length, 1, 'unique-skill should be present');

    const staticEntries = manifest.skills.filter((s: any) => s.name === 'my-skill');
    assert.equal(staticEntries.length, 1, 'static skill should be present');
  } finally {
    restoreEnv('AGEAF_SKILLS_DIR', origSkillsDir);
    restoreEnv('AGEAF_DISCOVERED_SKILLS_DIR', origDiscoveredDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadSkillsManifest static skills take precedence over discovered with same name', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-test-'));
  const origSkillsDir = process.env.AGEAF_SKILLS_DIR;
  const origDiscoveredDir = process.env.AGEAF_DISCOVERED_SKILLS_DIR;

  try {
    const skillsDir = path.join(tmpDir, 'static');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'manifest.json'),
      JSON.stringify({ version: 1, skills: [{ id: 'mermaid', name: 'mermaid', description: 'Native mermaid', tags: [], path: 'mermaid/SKILL.md' }] }),
    );
    process.env.AGEAF_SKILLS_DIR = skillsDir;

    const discoveredDir = path.join(tmpDir, 'discovered');
    fs.mkdirSync(discoveredDir, { recursive: true });
    fs.writeFileSync(
      path.join(discoveredDir, 'discovered-manifest.json'),
      JSON.stringify({
        version: 1,
        skills: [
          { id: 'discovered/vercel/mermaid', name: 'mermaid', description: 'Discovered mermaid', tags: [], path: 'vercel/mermaid/SKILL.md', discoveredAt: '2026-01-01', trustLevel: 'verified' },
        ],
      }),
    );
    process.env.AGEAF_DISCOVERED_SKILLS_DIR = discoveredDir;

    const { loadSkillsManifest } = await import('../src/runtimes/pi/skills.js');
    const manifest = loadSkillsManifest();

    const mermaidEntries = manifest.skills.filter((s: any) => s.name === 'mermaid');
    assert.equal(mermaidEntries.length, 1, 'only one mermaid');
    assert.equal(mermaidEntries[0].id, 'mermaid', 'static wins over discovered');
  } finally {
    restoreEnv('AGEAF_SKILLS_DIR', origSkillsDir);
    restoreEnv('AGEAF_DISCOVERED_SKILLS_DIR', origDiscoveredDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── addDiscoveredSkill tests ───

test('addDiscoveredSkill writes SKILL.md and updates manifest', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-test-'));
  const origDiscoveredDir = process.env.AGEAF_DISCOVERED_SKILLS_DIR;

  try {
    process.env.AGEAF_DISCOVERED_SKILLS_DIR = tmpDir;

    const { addDiscoveredSkill, loadDiscoveredManifest } = await import('../src/runtimes/pi/skills.js');

    const entry = await addDiscoveredSkill('---\nname: test-skill\ndescription: A test skill\n---\n\n# Test\n\nInstructions.', {
      name: 'test-skill',
      source: 'vercel-labs',
      trustLevel: 'verified',
      description: 'A test skill',
    });

    assert.equal(entry.id, 'discovered/vercel-labs/test-skill');
    assert.equal(entry.name, 'test-skill');
    assert.equal(entry.trustLevel, 'verified');

    // Verify file was written
    const skillPath = path.join(tmpDir, 'vercel-labs', 'test-skill', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), 'SKILL.md should exist');
    const content = fs.readFileSync(skillPath, 'utf8');
    assert.ok(content.includes('# Test'), 'content should have instructions');

    // Verify manifest was updated
    const manifest = loadDiscoveredManifest();
    assert.equal(manifest.skills.length, 1);
    assert.equal(manifest.skills[0]!.id, 'discovered/vercel-labs/test-skill');
  } finally {
    restoreEnv('AGEAF_DISCOVERED_SKILLS_DIR', origDiscoveredDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('addDiscoveredSkill rejects names with path separators', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-test-'));
  const origDiscoveredDir = process.env.AGEAF_DISCOVERED_SKILLS_DIR;

  try {
    process.env.AGEAF_DISCOVERED_SKILLS_DIR = tmpDir;
    const { addDiscoveredSkill } = await import('../src/runtimes/pi/skills.js');

    await assert.rejects(
      () => addDiscoveredSkill('content', { name: '../evil', source: 'local', trustLevel: 'community' }),
      /Invalid skill name/,
      'should reject path traversal in name',
    );

    await assert.rejects(
      () => addDiscoveredSkill('content', { name: 'ok-name', source: '../evil', trustLevel: 'community' }),
      /Invalid source name/,
      'should reject path traversal in source',
    );

    await assert.rejects(
      () => addDiscoveredSkill('content', { name: 'has.dot', source: 'local', trustLevel: 'community' }),
      /Invalid skill name/,
      'should reject dots in name',
    );
  } finally {
    restoreEnv('AGEAF_DISCOVERED_SKILLS_DIR', origDiscoveredDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('addDiscoveredSkill concurrent writes do not corrupt manifest', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-test-'));
  const origDiscoveredDir = process.env.AGEAF_DISCOVERED_SKILLS_DIR;

  try {
    process.env.AGEAF_DISCOVERED_SKILLS_DIR = tmpDir;
    const { addDiscoveredSkill, loadDiscoveredManifest } = await import('../src/runtimes/pi/skills.js');

    const content = '---\nname: skill-placeholder\ndescription: test\n---\n\nBody';

    // Fire 5 concurrent writes
    await Promise.all([
      addDiscoveredSkill(content, { name: 'skill-a', source: 'local', trustLevel: 'community' }),
      addDiscoveredSkill(content, { name: 'skill-b', source: 'local', trustLevel: 'community' }),
      addDiscoveredSkill(content, { name: 'skill-c', source: 'local', trustLevel: 'community' }),
      addDiscoveredSkill(content, { name: 'skill-d', source: 'local', trustLevel: 'community' }),
      addDiscoveredSkill(content, { name: 'skill-e', source: 'local', trustLevel: 'community' }),
    ]);

    const manifest = loadDiscoveredManifest();
    assert.equal(manifest.skills.length, 5, 'all 5 skills should be in manifest');
    const ids = manifest.skills.map((s: any) => s.id).sort();
    assert.deepEqual(ids, [
      'discovered/local/skill-a',
      'discovered/local/skill-b',
      'discovered/local/skill-c',
      'discovered/local/skill-d',
      'discovered/local/skill-e',
    ]);
  } finally {
    restoreEnv('AGEAF_DISCOVERED_SKILLS_DIR', origDiscoveredDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── validateSkillContent tests ───

test('validateSkillContent accepts valid SKILL.md', async () => {
  const { validateSkillContent } = await import('../src/runtimes/pi/skills.js');

  const result = validateSkillContent('---\nname: my-skill\ndescription: Does things\nallowed-tools:\n  - web_search\n---\n\n# Instructions');
  assert.equal(result.name, 'my-skill');
  assert.equal(result.description, 'Does things');
  assert.deepEqual(result.allowedTools, ['web_search']);
});

test('validateSkillContent requires description', async () => {
  const { validateSkillContent } = await import('../src/runtimes/pi/skills.js');

  assert.throws(
    () => validateSkillContent('---\nname: no-desc\n---\n\nBody'),
    /missing or empty "description"/,
  );
});

test('validateSkillContent allows missing name', async () => {
  const { validateSkillContent } = await import('../src/runtimes/pi/skills.js');

  const result = validateSkillContent('---\ndescription: Has desc but no name\n---\n\nBody');
  assert.equal(result.name, null);
  assert.equal(result.description, 'Has desc but no name');
});

test('validateSkillContent rejects missing frontmatter', async () => {
  const { validateSkillContent } = await import('../src/runtimes/pi/skills.js');

  assert.throws(
    () => validateSkillContent('No frontmatter here'),
    /missing opening ---/,
  );
});

test('validateSkillContent rejects unclosed frontmatter', async () => {
  const { validateSkillContent } = await import('../src/runtimes/pi/skills.js');

  assert.throws(
    () => validateSkillContent('---\nname: broken\n# No closing delimiter'),
    /missing closing ---/,
  );
});

// ─── preferences tests ───

test('updatePiPreferences handles skillTrustMode', async () => {
  const { updatePiPreferences, getPiPreferences } = await import('../src/runtimes/pi/preferences.js');

  // Default should be 'verified'
  assert.equal(getPiPreferences().skillTrustMode, 'verified');

  // Update to 'open'
  const result = updatePiPreferences({ skillTrustMode: 'open' });
  assert.equal(result.skillTrustMode, 'open');
  assert.equal(getPiPreferences().skillTrustMode, 'open');

  // Invalid value should not change
  updatePiPreferences({ skillTrustMode: 'invalid' });
  assert.equal(getPiPreferences().skillTrustMode, 'open', 'invalid value should not change preference');

  // Reset to default
  updatePiPreferences({ skillTrustMode: 'verified' });
  assert.equal(getPiPreferences().skillTrustMode, 'verified');
});

// ─── skillDiscovery.ts tool tests ───

test('createSkillDiscoveryBackend init produces find_skill and create_skill', async () => {
  const { createSkillDiscoveryBackend } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
  const backend = createSkillDiscoveryBackend();

  await backend.init();
  try {
    const catalog = backend.getCatalog();
    const names = catalog.map((t) => t.name);
    assert.ok(names.includes('find_skill'), 'should have find_skill');
    assert.ok(names.includes('create_skill'), 'should have create_skill');
    assert.equal(catalog.length, 2);

    const tools = backend.getAgentTools();
    assert.equal(tools.length, 2);
  } finally {
    await backend.shutdown();
  }
});

test('find_skill returns native skill for matching query', async () => {
  const { createSkillDiscoveryBackend } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
  const backend = createSkillDiscoveryBackend();

  await backend.init();
  try {
    const tools = backend.getAgentTools();
    const findSkill = tools.find((t) => t.name === 'find_skill')!;

    // Search for "mermaid" which should match the native mermaid skill
    const result = await findSkill.execute('test-call-1', { query: 'mermaid' });
    const text = result.content[0]?.text ?? '';
    assert.ok(text.includes('native skill'), `should find native skill, got: ${text.slice(0, 200)}`);
    assert.ok(text.includes('mermaid'), 'should mention mermaid');
  } finally {
    await backend.shutdown();
  }
});

test('find_skill returns empty query error', async () => {
  const { createSkillDiscoveryBackend } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
  const backend = createSkillDiscoveryBackend();

  await backend.init();
  try {
    const tools = backend.getAgentTools();
    const findSkill = tools.find((t) => t.name === 'find_skill')!;

    const result = await findSkill.execute('test-call-2', { query: '' });
    const text = result.content[0]?.text ?? '';
    assert.ok(text.includes('Error'), 'should return error for empty query');
  } finally {
    await backend.shutdown();
  }
});

test('create_skill validates and saves skill', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-test-'));
  const origDiscoveredDir = process.env.AGEAF_DISCOVERED_SKILLS_DIR;

  try {
    process.env.AGEAF_DISCOVERED_SKILLS_DIR = tmpDir;

    const { createSkillDiscoveryBackend } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
    const backend = createSkillDiscoveryBackend();

    await backend.init();
    try {
      const tools = backend.getAgentTools();
      const createSkill = tools.find((t) => t.name === 'create_skill')!;

      const content = '---\nname: my-custom-skill\ndescription: A custom skill for testing\n---\n\n# Custom Skill\n\nDo the thing.';
      const result = await createSkill.execute('test-call-3', {
        name: 'my-custom-skill',
        description: 'A custom skill for testing',
        content,
      });
      const text = result.content[0]?.text ?? '';
      assert.ok(text.includes('Skill created'), `should confirm creation, got: ${text.slice(0, 200)}`);
      assert.ok(text.includes('/my-custom-skill'), 'should include activation syntax');

      // Verify file exists
      const skillPath = path.join(tmpDir, 'local', 'my-custom-skill', 'SKILL.md');
      assert.ok(fs.existsSync(skillPath), 'SKILL.md should be written');
    } finally {
      await backend.shutdown();
    }
  } finally {
    restoreEnv('AGEAF_DISCOVERED_SKILLS_DIR', origDiscoveredDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('create_skill rejects invalid name', async () => {
  const { createSkillDiscoveryBackend } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
  const backend = createSkillDiscoveryBackend();

  await backend.init();
  try {
    const tools = backend.getAgentTools();
    const createSkill = tools.find((t) => t.name === 'create_skill')!;

    const result = await createSkill.execute('test-call-4', {
      name: 'INVALID NAME',
      description: 'test',
      content: '---\ndescription: test\n---\n\nBody',
    });
    const text = result.content[0]?.text ?? '';
    assert.ok(text.includes('Error'), 'should reject invalid name');
    assert.ok(text.includes('invalid skill name'), 'should mention invalid name');
  } finally {
    await backend.shutdown();
  }
});

test('create_skill rejects invalid content (missing description)', async () => {
  const { createSkillDiscoveryBackend } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
  const backend = createSkillDiscoveryBackend();

  await backend.init();
  try {
    const tools = backend.getAgentTools();
    const createSkill = tools.find((t) => t.name === 'create_skill')!;

    const result = await createSkill.execute('test-call-5', {
      name: 'valid-name',
      description: 'test',
      content: '---\nname: valid-name\n---\n\nNo description in frontmatter.',
    });
    const text = result.content[0]?.text ?? '';
    assert.ok(text.includes('Error'), 'should reject missing description');
  } finally {
    await backend.shutdown();
  }
});

test('create_skill uses frontmatter name as canonical when valid', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-test-'));
  const origDiscoveredDir = process.env.AGEAF_DISCOVERED_SKILLS_DIR;

  try {
    process.env.AGEAF_DISCOVERED_SKILLS_DIR = tmpDir;

    const { createSkillDiscoveryBackend } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
    const backend = createSkillDiscoveryBackend();

    await backend.init();
    try {
      const tools = backend.getAgentTools();
      const createSkill = tools.find((t) => t.name === 'create_skill')!;

      // Frontmatter name differs from parameter name — frontmatter wins
      const content = '---\nname: frontmatter-name\ndescription: A test\n---\n\nBody';
      const result = await createSkill.execute('test-call-6', {
        name: 'parameter-name',
        description: 'test',
        content,
      });
      const text = result.content[0]?.text ?? '';
      assert.ok(text.includes('/frontmatter-name'), 'should use frontmatter name as canonical');

      // Verify saved under frontmatter name
      const skillPath = path.join(tmpDir, 'local', 'frontmatter-name', 'SKILL.md');
      assert.ok(fs.existsSync(skillPath), 'should save under frontmatter name');
    } finally {
      await backend.shutdown();
    }
  } finally {
    restoreEnv('AGEAF_DISCOVERED_SKILLS_DIR', origDiscoveredDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('create_skill falls back to parameter name when frontmatter name is invalid', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-test-'));
  const origDiscoveredDir = process.env.AGEAF_DISCOVERED_SKILLS_DIR;

  try {
    process.env.AGEAF_DISCOVERED_SKILLS_DIR = tmpDir;

    const { createSkillDiscoveryBackend } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
    const backend = createSkillDiscoveryBackend();

    await backend.init();
    try {
      const tools = backend.getAgentTools();
      const createSkill = tools.find((t) => t.name === 'create_skill')!;

      // Frontmatter name has spaces (invalid) — parameter name used instead
      const content = '---\nname: Invalid Name With Spaces\ndescription: A test\n---\n\nBody';
      const result = await createSkill.execute('test-call-7', {
        name: 'valid-param',
        description: 'test',
        content,
      });
      const text = result.content[0]?.text ?? '';
      assert.ok(text.includes('/valid-param'), 'should fall back to parameter name');

      const skillPath = path.join(tmpDir, 'local', 'valid-param', 'SKILL.md');
      assert.ok(fs.existsSync(skillPath), 'should save under parameter name');
    } finally {
      await backend.shutdown();
    }
  } finally {
    restoreEnv('AGEAF_DISCOVERED_SKILLS_DIR', origDiscoveredDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── find_skill Tier-2 name conflict test ───

test('find_skill Tier-2 returns content directly when discovered name conflicts with static', async () => {
  // Setup: static has "chart-maker" (description: "Makes charts", no gantt keywords).
  // Discovered has "chart-maker" (description: "Advanced gantt diagrams", tags: [gantt]).
  // Query "gantt" → Tier 1 miss (no gantt in static) → Tier 2 hit on discovered "chart-maker".
  // But "chart-maker" name conflicts with static → should return content directly, not suggest /chart-maker.

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-test-'));
  const origSkillsDir = process.env.AGEAF_SKILLS_DIR;
  const origDiscoveredDir = process.env.AGEAF_DISCOVERED_SKILLS_DIR;

  try {
    const skillsDir = path.join(tmpDir, 'static');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        skills: [{ id: 'chart-maker', name: 'chart-maker', description: 'Makes charts', tags: [], path: 'chart-maker/SKILL.md' }],
      }),
    );
    process.env.AGEAF_SKILLS_DIR = skillsDir;

    const discoveredDir = path.join(tmpDir, 'discovered');
    const discSkillDir = path.join(discoveredDir, 'vercel', 'chart-maker');
    fs.mkdirSync(discSkillDir, { recursive: true });
    const discContent = '---\nname: chart-maker\ndescription: Advanced gantt diagrams and timelines\n---\n\n# Advanced Charts\n\nCreates gantt charts.';
    fs.writeFileSync(path.join(discSkillDir, 'SKILL.md'), discContent);
    fs.writeFileSync(
      path.join(discoveredDir, 'discovered-manifest.json'),
      JSON.stringify({
        version: 1,
        skills: [{
          id: 'discovered/vercel/chart-maker',
          name: 'chart-maker',
          description: 'Advanced gantt diagrams and timelines',
          tags: ['gantt'],
          path: 'vercel/chart-maker/SKILL.md',
          discoveredAt: '2026-01-01',
          trustLevel: 'verified',
        }],
      }),
    );
    process.env.AGEAF_DISCOVERED_SKILLS_DIR = discoveredDir;

    const { createSkillDiscoveryBackend } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
    const backend = createSkillDiscoveryBackend();

    await backend.init();
    try {
      const tools = backend.getAgentTools();
      const findSkill = tools.find((t) => t.name === 'find_skill')!;

      const result = await findSkill.execute('test-conflict', { query: 'gantt' });
      const text = result.content[0]?.text ?? '';

      // Should indicate shadowing and return content directly
      assert.ok(
        text.includes('shadowed') || text.includes('Content returned directly') || text.includes('Advanced Charts'),
        `should handle name conflict by returning content directly, got: ${text.slice(0, 300)}`,
      );
      // Should NOT suggest /chart-maker activation without content
      assert.ok(
        !text.includes('Already installed. Use /<skill-name> to activate.'),
        'should not suggest bare /name activation for shadowed skill',
      );
    } finally {
      await backend.shutdown();
    }
  } finally {
    restoreEnv('AGEAF_SKILLS_DIR', origSkillsDir);
    restoreEnv('AGEAF_DISCOVERED_SKILLS_DIR', origDiscoveredDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── buildSkillsGuidance with find_skill ───

test('buildSkillsGuidance includes skill discovery section when find_skill is active', async () => {
  const { loadSkillsManifest, buildSkillsGuidance } = await import('../src/runtimes/pi/skills.js');
  const manifest = loadSkillsManifest();

  const guidanceWithFindSkill = buildSkillsGuidance(manifest, ['find_skill', 'web_search']);
  assert.ok(guidanceWithFindSkill.includes('Skill Discovery'), 'should include Skill Discovery section');
  assert.ok(guidanceWithFindSkill.includes('find_skill'), 'should mention find_skill tool');

  const guidanceWithout = buildSkillsGuidance(manifest, ['web_search']);
  assert.ok(!guidanceWithout.includes('Skill Discovery'), 'should not include Skill Discovery without find_skill');
});

// ─── fetchSkillMd branch ordering tests ───

test('fetchSkillMd tries API-reported default branch first when it is master', async () => {
  const { fetchSkillMd } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
  const originalFetch = globalThis.fetch;
  const triedUrls: string[] = [];

  try {
    globalThis.fetch = (async (input: any, _init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      triedUrls.push(url);
      // Simulate: master branch has SKILL.md, main does not
      if (url.includes('/master/SKILL.md')) {
        return new Response('---\nname: test\ndescription: test skill\n---\n\n# Test', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    const content = await fetchSkillMd('owner', 'repo', 'master');
    assert.ok(content.includes('# Test'), 'should return content from master branch');

    // master should be tried first (index 0), not main
    assert.ok(triedUrls[0]!.includes('/master/SKILL.md'), `first URL should try master, got: ${triedUrls[0]}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchSkillMd falls back from main to master when main returns 404', async () => {
  const { fetchSkillMd } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
  const originalFetch = globalThis.fetch;
  const triedUrls: string[] = [];

  try {
    globalThis.fetch = (async (input: any, _init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      triedUrls.push(url);
      if (url.includes('/master/SKILL.md')) {
        return new Response('---\nname: fallback\ndescription: master fallback\n---\n\n# Master', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    // No defaultBranch provided — should try main first, then master
    const content = await fetchSkillMd('owner', 'repo');
    assert.ok(content.includes('# Master'), 'should fall back to master');
    assert.equal(triedUrls.length, 2, 'should have tried 2 URLs');
    assert.ok(triedUrls[0]!.includes('/main/SKILL.md'), 'first try should be main');
    assert.ok(triedUrls[1]!.includes('/master/SKILL.md'), 'second try should be master');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchSkillMd prepends custom default branch and deduplicates', async () => {
  const { fetchSkillMd } = await import('../src/runtimes/pi/toolBackends/skillDiscovery.js');
  const originalFetch = globalThis.fetch;
  const triedUrls: string[] = [];

  try {
    globalThis.fetch = (async (input: any, _init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      triedUrls.push(url);
      if (url.includes('/develop/SKILL.md')) {
        return new Response('---\nname: dev\ndescription: develop branch\n---\n\n# Develop', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    const content = await fetchSkillMd('owner', 'repo', 'develop');
    assert.ok(content.includes('# Develop'), 'should find on develop branch');
    // develop tried first, then falls through main/master until found
    assert.ok(triedUrls[0]!.includes('/develop/SKILL.md'), 'first try should be develop');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
