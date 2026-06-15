import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ToolBackend, ToolCatalogEntry } from './types.js';
import {
  loadStaticManifest,
  loadDiscoveredManifest,
  addDiscoveredSkill,
  validateSkillContent,
  loadSkillMarkdown,
  loadSkillRaw,
  parseSkillFrontmatter,
  type SkillEntry,
  type SkillsManifest,
} from '../skills.js';
import { getPiPreferences, type SkillTrustMode } from '../preferences.js';
import { getToolCatalog } from '../toolRuntime.js';

// --- Constants ---

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB DoS guard
const FETCH_TIMEOUT_MS = 10_000;

const VALID_SKILL_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

/**
 * Verified sources — trusted publishers for skill discovery.
 * When skillTrustMode is 'verified', only skills from these sources are returned.
 */
const VERIFIED_SOURCES = new Set([
  'anthropic',
  'vercel',
  'vercel-labs',
  'modelcontextprotocol',
]);

/**
 * Anthropic skill-creator guide template, embedded for the create_skill tool description.
 */
const SKILL_CREATOR_TEMPLATE = `A SKILL.md file must have YAML frontmatter delimited by --- containing at minimum:
- name: lowercase-hyphenated skill name
- description: what the skill does and when to use it

Optional frontmatter fields:
- allowed-tools: list of tool names the skill uses (e.g. web_search, web_fetch)
- tags: list of keywords for discovery

The body after frontmatter contains the skill instructions in markdown.

Example:
---
name: my-skill
description: Does something useful. Use when the user asks for X.
allowed-tools:
  - web_search
---

# My Skill

Instructions for the agent to follow when this skill is activated...`;

// --- Fuzzy matching ---

type ScoredSkill = { skill: SkillEntry; score: number };

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s\-_/]+/).filter(Boolean);
}

function fuzzyMatchSkills(skills: SkillEntry[], query: string): ScoredSkill[] {
  const lowerQuery = query.toLowerCase();
  const queryTokens = tokenize(query);
  const results: ScoredSkill[] = [];

  for (const skill of skills) {
    const nameLower = skill.name.toLowerCase();
    const descLower = skill.description.toLowerCase();
    const tagsLower = skill.tags.map((t) => t.toLowerCase());

    let score = 0;

    // Tier 1: whole-phrase matches (highest confidence)
    if (nameLower === lowerQuery) {
      score = 100;
    } else if (nameLower.includes(lowerQuery)) {
      score = 80;
    } else if (descLower.includes(lowerQuery)) {
      score = 60;
    } else if (tagsLower.some((tag) => tag.includes(lowerQuery))) {
      score = 50;
    }

    // Tier 2: per-word matching — score by fraction of query words that hit
    if (score < 40 && queryTokens.length > 0) {
      const nameTokens = tokenize(skill.name);
      const descTokens = tokenize(skill.description);

      let hits = 0;
      for (const qt of queryTokens) {
        if (nameTokens.some((nt) => nt.includes(qt) || qt.includes(nt))) {
          hits += 2; // name hits are worth double
        } else if (descTokens.some((dt) => dt.includes(qt) || qt.includes(dt))) {
          hits += 1;
        } else if (tagsLower.some((tag) => tag.includes(qt))) {
          hits += 1;
        }
      }

      // Require at least one word to hit; scale 20-45 based on coverage
      if (hits > 0) {
        const maxHits = queryTokens.length * 2; // all words hitting name
        const ratio = Math.min(hits / maxHits, 1);
        score = Math.max(score, 20 + Math.round(ratio * 25));
      }
    }

    if (score >= 30) {
      results.push({ skill, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

// --- Fetch with byte cap ---

async function fetchWithByteCap(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'Ageaf-SkillDiscovery/1.0' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      reader.cancel();
      throw new Error(`Response exceeded ${MAX_RESPONSE_BYTES} byte limit`);
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(buffer);
}

// --- SKILL.md fetch with branch fallback ---

const FALLBACK_BRANCHES = ['main', 'master'];

/**
 * Fetch SKILL.md from a GitHub repo, trying common default branch names.
 * Returns the content string on success, throws on failure.
 */
export async function fetchSkillMd(owner: string, repo: string, defaultBranch?: string): Promise<string> {
  // Build branch order: try the API-reported default branch first, then fallbacks.
  // Dedup ensures we don't probe the same branch twice.
  const branches = defaultBranch
    ? [defaultBranch, ...FALLBACK_BRANCHES.filter((b) => b !== defaultBranch)]
    : [...FALLBACK_BRANCHES];

  let lastError: Error | null = null;
  for (const branch of branches) {
    try {
      return await fetchWithByteCap(
        `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/SKILL.md`,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Only retry on 404 (wrong branch); other errors are fatal
      if (!lastError.message.includes('404')) throw lastError;
    }
  }
  throw lastError ?? new Error('No branches to try');
}

// --- npm search ---

type NpmSearchResult = {
  name: string;
  description: string;
  repoOwner: string | null;
  repoUrl: string | null;
  repoName: string | null;
};

async function searchNpm(query: string): Promise<NpmSearchResult[]> {
  const searchUrl = `https://registry.npmjs.org/-/v1/search?text=keywords:agent-skill+${encodeURIComponent(query)}&size=10`;
  const raw = await fetchWithByteCap(searchUrl);
  const data = JSON.parse(raw) as {
    objects?: Array<{
      package: {
        name: string;
        description?: string;
        links?: { repository?: string };
        publisher?: { username?: string };
      };
    }>;
  };

  return (data.objects ?? []).map((obj) => {
    const pkg = obj.package;
    const repoUrl = pkg.links?.repository ?? null;

    // Extract owner/name from GitHub URL
    let repoOwner: string | null = null;
    let repoName: string | null = null;
    if (repoUrl) {
      const ghMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (ghMatch) {
        repoOwner = ghMatch[1]!;
        repoName = ghMatch[2]!.replace(/\.git$/, '');
      }
    }

    return {
      name: pkg.name,
      description: pkg.description ?? '',
      repoOwner,
      repoUrl,
      repoName,
    };
  });
}

// --- GitHub search ---

type GitHubSearchResult = {
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string;
  stars: number;
};

async function searchGitHub(query: string): Promise<GitHubSearchResult[]> {
  const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+topic:agent-skill&sort=stars&per_page=5`;
  const raw = await fetchWithByteCap(searchUrl);
  const data = JSON.parse(raw) as {
    items?: Array<{
      owner: { login: string };
      name: string;
      default_branch: string;
      description: string | null;
      stargazers_count: number;
    }>;
  };

  return (data.items ?? []).map((item) => ({
    owner: item.owner.login,
    repo: item.name,
    defaultBranch: item.default_branch,
    description: item.description ?? '',
    stars: item.stargazers_count,
  }));
}

// --- Compatibility check ---

function annotateCompatibility(allowedTools: string[]): string {
  if (allowedTools.length === 0) return '';

  try {
    const catalog = getToolCatalog();
    const activeNames = new Set(catalog.map((t) => t.name));
    const missing = allowedTools.filter((t) => !activeNames.has(t));

    if (missing.length === 0) return ' [all tools available]';
    return ` [missing: ${missing.join(', ')}]`;
  } catch {
    return '';
  }
}

// --- Tool implementations ---

const FindSkillParams = Type.Object({
  query: Type.String({ description: 'What kind of skill to search for' }),
  install: Type.Optional(Type.Boolean({
    description: 'If true, install the best match and return its full content for immediate use. Default: false (search only).',
  })),
});

const CreateSkillParams = Type.Object({
  name: Type.String({ description: 'Skill name (lowercase, hyphens allowed, e.g. "gantt-chart")' }),
  description: Type.String({ description: 'One-line description of what the skill does' }),
  content: Type.String({ description: 'Full SKILL.md content with YAML frontmatter (---delimited) and markdown body' }),
});

function createFindSkillTool(): AgentTool<typeof FindSkillParams> {
  return {
    name: 'find_skill',
    label: 'Find Skill',
    description: 'Search for an agent skill by query. Searches native skills first, then previously installed skills, then online registries (npm, GitHub). Use install=true to install and get the full skill content for immediate use.',
    parameters: FindSkillParams,
    async execute(_toolCallId, params) {
      const query = params.query.trim();
      if (!query) {
        return { content: [{ type: 'text', text: 'Error: query is required.' }], details: {} };
      }

      const install = params.install ?? false;

      // Tier 1 — Native embedded skills
      const staticManifest = loadStaticManifest();
      const nativeMatches = fuzzyMatchSkills(staticManifest.skills, query);
      if (nativeMatches.length > 0) {
        const lines = ['Found native skill(s):'];
        for (const { skill, score } of nativeMatches) {
          const compat = annotateCompatibility(
            getCachedAllowedTools(skill),
          );
          lines.push(`  - /${skill.name}: ${skill.description.split('\n')[0]?.trim() ?? ''} (score: ${score})${compat}`);
        }
        if (install && nativeMatches.length > 0) {
          const best = nativeMatches[0]!.skill;
          const markdown = loadSkillMarkdown(best);
          if (markdown) {
            lines.push('', `Skill /${best.name} is natively available; instructions attached:`, '', markdown);
          }
        } else {
          lines.push('', 'Use /<skill-name> to activate.');
        }
        return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
      }

      // Tier 2 — Previously discovered skills
      const discoveredManifest = loadDiscoveredManifest();
      const discoveredMatches = fuzzyMatchSkills(discoveredManifest.skills, query);
      if (discoveredMatches.length > 0) {
        // Check if any discovered match names conflict with static skills
        const staticNames = new Set(staticManifest.skills.map((s) => s.name.toLowerCase()));

        const lines = ['Found previously installed skill(s):'];
        for (const { skill, score } of discoveredMatches) {
          const conflictsWithStatic = staticNames.has(skill.name.toLowerCase());
          const suffix = conflictsWithStatic ? ' (name shadowed by native skill — content returned directly)' : '';
          lines.push(`  - /${skill.name}: ${skill.description.split('\n')[0]?.trim() ?? ''} (score: ${score})${suffix}`);
        }
        if (install && discoveredMatches.length > 0) {
          const best = discoveredMatches[0]!.skill;
          const markdown = loadSkillMarkdown(best);
          if (markdown) {
            lines.push('', `Skill /${best.name} already installed; instructions attached:`, '', markdown);
          }
        } else {
          // If the top match conflicts with a static name, return its content directly
          // since /name would activate the static skill instead
          const best = discoveredMatches[0]!.skill;
          if (staticNames.has(best.name.toLowerCase())) {
            const markdown = loadSkillMarkdown(best);
            if (markdown) {
              lines.push('', `Note: /${best.name} is shadowed by a native skill. Content returned directly:`, '', markdown);
            }
          } else {
            lines.push('', 'Already installed. Use /<skill-name> to activate.');
          }
        }
        return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
      }

      // Tier 3a — npm registry
      const trustMode = getPiPreferences().skillTrustMode;
      let qualifiedNpmResults: Array<{ name: string; description: string; skillContent: string; owner: string }> = [];

      try {
        const npmResults = await searchNpm(query);
        const filtered = filterByTrust(npmResults.map((r) => ({
          owner: r.repoOwner ?? '',
          name: r.name,
          description: r.description,
          repoOwner: r.repoOwner,
          repoName: r.repoName,
        })), trustMode);

        // Probe SKILL.md URLs in parallel with branch fallback
        const probeable = filtered.filter((r) => r.repoOwner && r.repoName);
        const probeResults = await Promise.allSettled(
          probeable.map(async (result) => {
            const content = await fetchSkillMd(result.repoOwner!, result.repoName!);
            const validated = validateSkillContent(content);
            const compat = annotateCompatibility(validated.allowedTools);
            return {
              name: validated.name ?? result.name,
              description: `${validated.description}${compat}`,
              skillContent: content,
              owner: result.repoOwner!,
            };
          }),
        );
        for (const r of probeResults) {
          if (r.status === 'fulfilled') qualifiedNpmResults.push(r.value);
        }
      } catch (err) {
        // npm search failed — will fall through to GitHub
        console.warn('[find_skill] npm search error:', err instanceof Error ? err.message : err);
      }

      if (qualifiedNpmResults.length > 0) {
        return buildOnlineResult(qualifiedNpmResults, install, trustMode);
      }

      // Tier 3b — GitHub search (fallback when npm yields no qualified results)
      let qualifiedGhResults: Array<{ name: string; description: string; skillContent: string; owner: string }> = [];

      try {
        const ghResults = await searchGitHub(query);
        const filtered = trustMode === 'verified'
          ? ghResults.filter((r) => VERIFIED_SOURCES.has(r.owner.toLowerCase()))
          : ghResults;

        // Probe SKILL.md URLs in parallel with branch fallback
        const ghProbeResults = await Promise.allSettled(
          filtered.map(async (result) => {
            const content = await fetchSkillMd(result.owner, result.repo, result.defaultBranch);
            const validated = validateSkillContent(content);
            const compat = annotateCompatibility(validated.allowedTools);
            return {
              name: validated.name ?? result.repo,
              description: `${validated.description}${compat}`,
              skillContent: content,
              owner: result.owner,
            };
          }),
        );
        for (const r of ghProbeResults) {
          if (r.status === 'fulfilled') qualifiedGhResults.push(r.value);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('403')) {
          return {
            content: [{ type: 'text', text: `GitHub rate limit reached. Try again later or use create_skill to author a skill.\n\n${SKILL_CREATOR_TEMPLATE}` }],
            details: {},
          };
        }
        console.warn('[find_skill] GitHub search error:', errMsg);
      }

      if (qualifiedGhResults.length > 0) {
        return buildOnlineResult(qualifiedGhResults, install, trustMode);
      }

      // Tier 4 — Self-author fallback
      return {
        content: [{
          type: 'text',
          text: `No skills found for "${query}". You can create one using the create_skill tool.\n\n${SKILL_CREATOR_TEMPLATE}`,
        }],
        details: {},
      };
    },
  };
}

// Helper to get allowed-tools for a skill
function getCachedAllowedTools(skill: SkillEntry): string[] {
  try {
    const rawContent = loadSkillRaw(skill);
    const fm = parseSkillFrontmatter(rawContent);
    return fm?.allowedTools ?? [];
  } catch {
    return [];
  }
}

type OnlineResult = { name: string; description: string; skillContent: string; owner: string };

function filterByTrust(
  results: Array<{ owner: string; name: string; description: string; repoOwner: string | null; repoName: string | null }>,
  trustMode: SkillTrustMode,
): typeof results {
  if (trustMode === 'open') return results;
  return results.filter((r) => r.repoOwner && VERIFIED_SOURCES.has(r.repoOwner.toLowerCase()));
}

async function buildOnlineResult(
  results: OnlineResult[],
  install: boolean,
  _trustMode: SkillTrustMode,
): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, never> }> {
  if (install && results.length > 0) {
    const best = results[0]!;
    try {
      const validated = validateSkillContent(best.skillContent);
      if (!validated.name) {
        throw new Error('Downloaded skill missing name in frontmatter');
      }

      await addDiscoveredSkill(best.skillContent, {
        name: validated.name,
        source: best.owner.toLowerCase(),
        trustLevel: VERIFIED_SOURCES.has(best.owner.toLowerCase()) ? 'verified' : 'community',
        description: validated.description,
      });

      return {
        content: [{
          type: 'text',
          text: `Skill installed; instructions attached:\n\n${best.skillContent}`,
        }],
        details: {},
      };
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: `Failed to install skill: ${err instanceof Error ? err.message : String(err)}\n\nYou can create one using create_skill instead.\n\n${SKILL_CREATOR_TEMPLATE}`,
        }],
        details: {},
      };
    }
  }

  // Search-only mode — list results
  const lines = ['Found online skill(s):'];
  for (const result of results) {
    lines.push(`  - ${result.name} (by ${result.owner}): ${result.description}`);
  }
  lines.push('', 'Call find_skill with install=true to install the best match.');
  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

function createCreateSkillTool(): AgentTool<typeof CreateSkillParams> {
  return {
    name: 'create_skill',
    label: 'Create Skill',
    description: `Create a new agent skill from SKILL.md content. The content must have YAML frontmatter with at least a "description" field. Use this when no existing skill matches the task.\n\nSKILL.md format:\n${SKILL_CREATOR_TEMPLATE}`,
    parameters: CreateSkillParams,
    async execute(_toolCallId, params) {
      const nameParam = params.name.trim();

      // Step 1: Validate name parameter
      if (!VALID_SKILL_NAME_REGEX.test(nameParam)) {
        return {
          content: [{ type: 'text', text: `Error: invalid skill name "${nameParam}". Must be lowercase alphanumeric with hyphens, 2-64 chars.` }],
          details: {},
        };
      }

      // Step 2: Validate content
      let validated;
      try {
        validated = validateSkillContent(params.content);
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
        };
      }

      // Step 3: Resolve canonical name
      let canonicalName = nameParam;
      if (validated.name && VALID_SKILL_NAME_REGEX.test(validated.name)) {
        if (validated.name !== nameParam) {
          console.warn(`[create_skill] Frontmatter name "${validated.name}" differs from parameter "${nameParam}" — using frontmatter name`);
        }
        canonicalName = validated.name;
      }

      // Step 4: Save
      try {
        await addDiscoveredSkill(params.content, {
          name: canonicalName,
          source: 'local',
          trustLevel: 'community',
          description: validated.description,
        });
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error saving skill: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
        };
      }

      // Step 5: Return confirmation with full content
      return {
        content: [{
          type: 'text',
          text: `Skill created; instructions attached:\n\nUse /${canonicalName} to activate in future turns.\n\n${params.content}`,
        }],
        details: {},
      };
    },
  };
}

// --- Backend ---

export function createSkillDiscoveryBackend(): ToolBackend {
  let catalog: ToolCatalogEntry[] = [];
  let agentTools: AgentTool<any>[] = [];

  return {
    async init() {
      const findSkill = createFindSkillTool();
      const createSkill = createCreateSkillTool();

      agentTools = [findSkill, createSkill];
      catalog = agentTools.map((t) => ({
        name: t.name,
        label: t.label ?? t.name,
        description: t.description ?? '',
        source: 'skill-discovery',
      }));
    },

    getCatalog() { return catalog; },
    getAgentTools() { return agentTools; },

    async shutdown() {
      catalog = [];
      agentTools = [];
    },
  };
}
