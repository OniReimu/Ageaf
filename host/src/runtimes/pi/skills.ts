import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export type SkillEntry = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  path: string;
};

export type DiscoveredSkillEntry = SkillEntry & {
  discoveredAt: string;
  trustLevel: 'verified' | 'community';
  registryUrl?: string;
};

export type SkillsManifest = { version: number; skills: SkillEntry[] };

export type DiscoveredManifest = { version: number; skills: DiscoveredSkillEntry[] };

export type SkillFrontmatter = {
  allowedTools?: string[];
};

export type ValidatedSkillContent = {
  name: string | null;
  description: string;
  allowedTools: string[];
};

// Regex for valid skill/source names: lowercase alphanumeric with hyphens
const VALID_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;
const VALID_SKILL_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

function resolveRepoRoot(): string {
  // Walk up from this file's directory until we find a directory containing package.json (host root),
  // then go one level up to reach the repo root.
  if (process.env.AGEAF_SKILLS_DIR) {
    return path.dirname(process.env.AGEAF_SKILLS_DIR);
  }

  const __filename = fileURLToPath(import.meta.url);
  let dir = path.dirname(__filename);
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      // Found host root — repo root is one level up
      return path.dirname(dir);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume we're in host/src/runtimes/pi/
  return path.resolve(path.dirname(__filename), '..', '..', '..', '..');
}

function resolveManifestPath(): string {
  if (process.env.AGEAF_SKILLS_DIR) {
    return path.join(process.env.AGEAF_SKILLS_DIR, 'manifest.json');
  }
  return path.join(resolveRepoRoot(), 'public', 'skills', 'manifest.json');
}

function resolveSkillPath(skill: SkillEntry): string {
  // Discovered skills are stored under ~/.ageaf/pi/skills/
  if (skill.id.startsWith('discovered/')) {
    return path.join(resolveDiscoveredDir(), skill.path);
  }
  return process.env.AGEAF_SKILLS_DIR
    ? path.join(process.env.AGEAF_SKILLS_DIR, skill.path.replace(/^skills\//, ''))
    : path.join(resolveRepoRoot(), 'public', skill.path);
}

// --- Discovered skills infrastructure ---

export function resolveDiscoveredDir(): string {
  if (process.env.AGEAF_DISCOVERED_SKILLS_DIR) {
    return process.env.AGEAF_DISCOVERED_SKILLS_DIR;
  }
  return path.join(os.homedir(), '.ageaf', 'pi', 'skills');
}

function resolveDiscoveredManifestPath(): string {
  return path.join(resolveDiscoveredDir(), 'discovered-manifest.json');
}

/**
 * Load the static (bundled) skills manifest from public/skills/manifest.json.
 * Exported so skillDiscovery.ts can search native skills independently.
 */
export function loadStaticManifest(): SkillsManifest {
  const manifestPath = resolveManifestPath();
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as SkillsManifest;
    if (!Array.isArray(parsed.skills)) {
      return { version: 1, skills: [] };
    }
    return parsed;
  } catch {
    return { version: 1, skills: [] };
  }
}

/**
 * Load the discovered skills manifest from ~/.ageaf/pi/skills/discovered-manifest.json.
 * Returns an empty manifest if the file doesn't exist or is invalid.
 */
export function loadDiscoveredManifest(): DiscoveredManifest {
  const manifestPath = resolveDiscoveredManifestPath();
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as DiscoveredManifest;
    if (!Array.isArray(parsed.skills)) {
      return { version: 1, skills: [] };
    }
    return parsed;
  } catch {
    return { version: 1, skills: [] };
  }
}

/**
 * Load merged manifest (static + discovered). Static skills take precedence on name conflict.
 * This is the main entry point used by run.ts and buildSkillsGuidance().
 */
export function loadSkillsManifest(): SkillsManifest {
  const staticManifest = loadStaticManifest();
  const discoveredManifest = loadDiscoveredManifest();

  if (discoveredManifest.skills.length === 0) {
    return staticManifest;
  }

  // Precedence: static > discovered (first by name wins among discovered).
  // Discovered entries are sorted by id (alphabetical by source) in addDiscoveredSkill(),
  // so the first occurrence of a name is deterministic.
  const staticNames = new Set(staticManifest.skills.map((s) => s.name.toLowerCase()));
  const seenDiscoveredNames = new Set<string>();
  const dedupedDiscovered = discoveredManifest.skills.filter((s) => {
    const lower = s.name.toLowerCase();
    if (staticNames.has(lower) || seenDiscoveredNames.has(lower)) return false;
    seenDiscoveredNames.add(lower);
    return true;
  });
  const mergedSkills = [
    ...staticManifest.skills,
    ...dedupedDiscovered,
  ];

  return { version: 1, skills: mergedSkills };
}

// In-process promise chain to prevent race conditions on concurrent manifest writes
let manifestWriteChain: Promise<void> = Promise.resolve();

/**
 * Add a discovered skill to the local cache directory.
 * Writes SKILL.md to ~/.ageaf/pi/skills/{source}/{name}/SKILL.md
 * and updates discovered-manifest.json.
 */
export async function addDiscoveredSkill(
  content: string,
  meta: {
    name: string;
    source: string;
    trustLevel: 'verified' | 'community';
    registryUrl?: string;
    description?: string;
  },
): Promise<DiscoveredSkillEntry> {
  // Validate name and source to prevent path traversal
  if (!VALID_NAME_REGEX.test(meta.source)) {
    throw new Error(`Invalid source name: ${meta.source} — must match ${VALID_NAME_REGEX}`);
  }
  if (!VALID_SKILL_NAME_REGEX.test(meta.name)) {
    throw new Error(`Invalid skill name: ${meta.name} — must match ${VALID_SKILL_NAME_REGEX}`);
  }

  const discoveredDir = resolveDiscoveredDir();
  const skillDir = path.join(discoveredDir, meta.source, meta.name);
  const skillPath = path.join(skillDir, 'SKILL.md');

  // Build the entry
  const entry: DiscoveredSkillEntry = {
    id: `discovered/${meta.source}/${meta.name}`,
    name: meta.name,
    description: meta.description ?? '',
    tags: [],
    path: `${meta.source}/${meta.name}/SKILL.md`,
    discoveredAt: new Date().toISOString(),
    trustLevel: meta.trustLevel,
    registryUrl: meta.registryUrl,
  };

  // Chain writes to prevent concurrent manifest corruption
  const writeOp = manifestWriteChain.then(async () => {
    // Write SKILL.md
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, content, 'utf8');

    // Read-modify-write discovered-manifest.json
    const manifest = loadDiscoveredManifest();
    // Remove existing entry with same id if present (update case)
    manifest.skills = manifest.skills.filter((s) => s.id !== entry.id);
    manifest.skills.push(entry);
    manifest.skills.sort((a, b) => a.id.localeCompare(b.id));

    const manifestPath = resolveDiscoveredManifestPath();
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  });

  manifestWriteChain = writeOp.catch(() => {});
  await writeOp;

  return entry;
}

/**
 * Validate SKILL.md content: checks frontmatter structure, requires description,
 * returns name (optional) and allowedTools.
 * Throws on structural failures (missing delimiters, unparseable YAML, missing description).
 */
export function validateSkillContent(raw: string): ValidatedSkillContent {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) {
    throw new Error('Invalid SKILL.md: missing opening --- frontmatter delimiter');
  }

  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx < 0) {
    throw new Error('Invalid SKILL.md: missing closing --- frontmatter delimiter');
  }

  const yamlStr = trimmed.slice(3, endIdx).trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = YAML.parse(yamlStr) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Invalid SKILL.md: YAML parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid SKILL.md: frontmatter is not an object');
  }

  // Description is required
  const description = parsed.description;
  if (typeof description !== 'string' || !description.trim()) {
    throw new Error('Invalid SKILL.md: missing or empty "description" in frontmatter');
  }

  // Name is optional — returned as string | null
  const name = typeof parsed.name === 'string' && parsed.name.trim()
    ? parsed.name.trim()
    : null;

  // Extract allowed-tools via existing logic
  const tools = parsed['allowed-tools'];
  const allowedTools = Array.isArray(tools)
    ? tools.filter((t): t is string => typeof t === 'string')
    : [];

  return { name, description: description.trim(), allowedTools };
}

/**
 * Read skill file including frontmatter (not stripped).
 */
export function loadSkillRaw(skill: SkillEntry): string {
  const skillPath = resolveSkillPath(skill);
  try {
    return fs.readFileSync(skillPath, 'utf8');
  } catch {
    return '';
  }
}

export function loadSkillMarkdown(skill: SkillEntry): string {
  const raw = loadSkillRaw(skill);
  if (!raw) return '';
  // Strip YAML frontmatter if present
  if (raw.startsWith('---')) {
    const endIdx = raw.indexOf('\n---', 3);
    if (endIdx >= 0) {
      return raw.slice(endIdx + 4).trim();
    }
  }
  return raw.trim();
}

// Cache parsed frontmatter to avoid re-reading on every request
const frontmatterCache = new Map<string, SkillFrontmatter | null>();

/**
 * Parse YAML frontmatter from a skill file's raw content.
 * Returns null if no frontmatter is present.
 */
export function parseSkillFrontmatter(raw: string): SkillFrontmatter | null {
  if (!raw.startsWith('---')) return null;
  const endIdx = raw.indexOf('\n---', 3);
  if (endIdx < 0) return null;

  const yamlStr = raw.slice(3, endIdx).trim();
  try {
    const parsed = YAML.parse(yamlStr) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const result: SkillFrontmatter = {};
    const tools = parsed['allowed-tools'];
    if (Array.isArray(tools)) {
      result.allowedTools = tools.filter((t): t is string => typeof t === 'string');
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Get cached frontmatter for a skill. Parses and caches on first access.
 */
function getCachedFrontmatter(skill: SkillEntry): SkillFrontmatter | null {
  const key = skill.id ?? skill.name;
  if (frontmatterCache.has(key)) return frontmatterCache.get(key)!;

  const raw = loadSkillRaw(skill);
  const fm = parseSkillFrontmatter(raw);
  frontmatterCache.set(key, fm);
  return fm;
}

export function buildSkillsGuidance(
  manifest: SkillsManifest,
  activeToolNames?: string[],
): string {
  if (manifest.skills.length === 0) {
    return '';
  }

  const activeSet = activeToolNames ? new Set(activeToolNames) : null;
  const hasFindSkill = activeSet?.has('find_skill') ?? false;

  const lines = [
    'Available Skills (CRITICAL):',
    '- Ageaf supports skill directives.',
    '- Available skills include:',
  ];

  for (const skill of manifest.skills) {
    const desc = skill.description.split('\n')[0]?.trim() ?? '';
    let suffix = '';

    // If we have active tools, annotate skills whose tools are all available
    if (activeSet) {
      const fm = getCachedFrontmatter(skill);
      if (fm?.allowedTools && fm.allowedTools.length > 0) {
        const allAvailable = fm.allowedTools.every((t) => activeSet.has(t));
        if (allAvailable) {
          suffix = ' [tools available]';
        }
      }
    }

    lines.push(`  \u2022 /${skill.name} - ${desc}${suffix}`);
  }

  lines.push(
    '- If the user includes a /skillName directive, you MUST follow that skill for this request.',
    '- Skill text may be injected under "Additional instructions" for the request; do NOT try to locate skills on disk.',
    '- Do not announce skill-loading or mention internal skill frameworks; just apply the skill.',
  );

  // When find_skill is available, add skill discovery guidance
  if (hasFindSkill) {
    lines.push(
      '',
      'Skill Discovery:',
      '- If a task would benefit from a specialized skill not listed above, use the find_skill tool to search for one.',
      '- The find_skill tool searches native skills first, then previously installed skills, then online registries (npm, GitHub).',
      '- If no skill is found, use the create_skill tool to author one on the fly.',
    );
  } else {
    lines.push(
      '- These skills are part of the Ageaf system and do NOT require external installation.',
    );
  }

  return lines.join('\n');
}

export function findSkillByName(manifest: SkillsManifest, name: string): SkillEntry | null {
  const normalized = name.replace(/^\//, '').toLowerCase();
  return manifest.skills.find((s) => s.name.toLowerCase() === normalized) ?? null;
}
