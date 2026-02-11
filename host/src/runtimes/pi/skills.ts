import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SkillEntry = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  path: string;
};

export type SkillsManifest = { version: number; skills: SkillEntry[] };

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

export function loadSkillsManifest(): SkillsManifest {
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

export function loadSkillMarkdown(skill: SkillEntry): string {
  const skillPath = process.env.AGEAF_SKILLS_DIR
    ? path.join(process.env.AGEAF_SKILLS_DIR, skill.path.replace(/^skills\//, ''))
    : path.join(resolveRepoRoot(), 'public', skill.path);
  try {
    const raw = fs.readFileSync(skillPath, 'utf8');
    // Strip YAML frontmatter if present
    if (raw.startsWith('---')) {
      const endIdx = raw.indexOf('\n---', 3);
      if (endIdx >= 0) {
        return raw.slice(endIdx + 4).trim();
      }
    }
    return raw.trim();
  } catch {
    return '';
  }
}

export function buildSkillsGuidance(manifest: SkillsManifest): string {
  if (manifest.skills.length === 0) {
    return '';
  }

  const lines = [
    'Available Skills (CRITICAL):',
    '- Ageaf supports built-in skill directives.',
    '- Available skills include:',
  ];

  for (const skill of manifest.skills) {
    const desc = skill.description.split('\n')[0]?.trim() ?? '';
    lines.push(`  \u2022 /${skill.name} - ${desc}`);
  }

  lines.push(
    '- If the user includes a /skillName directive, you MUST follow that skill for this request.',
    '- Skill text may be injected under "Additional instructions" for the request; do NOT try to locate skills on disk.',
    '- These skills are part of the Ageaf system and do NOT require external installation.',
    '- Do not announce skill-loading or mention internal skill frameworks; just apply the skill.',
  );

  return lines.join('\n');
}

export function findSkillByName(manifest: SkillsManifest, name: string): SkillEntry | null {
  const normalized = name.replace(/^\//, '').toLowerCase();
  return manifest.skills.find((s) => s.name.toLowerCase() === normalized) ?? null;
}
