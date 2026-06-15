/**
 * Skills Registry - Client-side skills management
 *
 * Provides functions to load, search, and fetch bundled skills
 * from the extension's manifest.json.
 */

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  source: string;
  path: string;
  autoContext?: string[];
}

export interface SkillsManifest {
  version: number;
  generatedAt: string;
  skills: SkillEntry[];
}

// Cache for loaded manifest and skill markdown
let manifestCache: SkillsManifest | null = null;
const markdownCache = new Map<string, string>();

/**
 * Load the skills manifest from extension assets
 * @returns Promise<SkillsManifest>
 */
export async function loadSkillsManifest(): Promise<SkillsManifest> {
  if (manifestCache) {
    return manifestCache;
  }

  const manifestUrl = chrome.runtime.getURL('skills/manifest.json');
  const response = await fetch(manifestUrl);

  if (!response.ok) {
    throw new Error(`Failed to load skills manifest: ${response.statusText}`);
  }

  manifestCache = await response.json();
  return manifestCache!;
}

/**
 * Search skills by query (matches name, description, tags)
 * @param skills - Array of skill entries
 * @param query - Search query (case-insensitive)
 * @returns Filtered and sorted skill entries
 */
export function searchSkills(skills: SkillEntry[], query: string): SkillEntry[] {
  const trimmedQuery = query.trim();

  // Return all skills for empty query
  if (!trimmedQuery) {
    return skills;
  }

  const lowerQuery = trimmedQuery.toLowerCase();

  // Filter skills
  const matches = skills.filter((skill) => {
    const nameMatch = skill.name.toLowerCase().includes(lowerQuery);
    const descMatch = skill.description.toLowerCase().includes(lowerQuery);
    const tagsMatch = skill.tags.some((tag) => tag.toLowerCase().includes(lowerQuery));

    return nameMatch || descMatch || tagsMatch;
  });

  // Sort by relevance: exact name match > name prefix > name substring > description/tags
  const sorted = matches.sort((a, b) => {
    const aNameLower = a.name.toLowerCase();
    const bNameLower = b.name.toLowerCase();

    // Exact name match first
    const aExact = aNameLower === lowerQuery;
    const bExact = bNameLower === lowerQuery;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    // Name prefix match second
    const aPrefix = aNameLower.startsWith(lowerQuery);
    const bPrefix = bNameLower.startsWith(lowerQuery);
    if (aPrefix && !bPrefix) return -1;
    if (!aPrefix && bPrefix) return 1;

    // Name substring match third
    const aNameMatch = aNameLower.includes(lowerQuery);
    const bNameMatch = bNameLower.includes(lowerQuery);
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;

    // Alphabetical by name as tiebreaker
    return aNameLower.localeCompare(bNameLower);
  });

  return sorted;
}

/**
 * Load skill markdown content from extension assets
 * @param skill - Skill entry
 * @returns Promise<string> - Markdown content with frontmatter stripped
 */
export async function loadSkillMarkdown(skill: SkillEntry): Promise<string> {
  // Check cache first
  if (markdownCache.has(skill.id)) {
    return markdownCache.get(skill.id)!;
  }

  const skillUrl = chrome.runtime.getURL(skill.path);
  const response = await fetch(skillUrl);

  if (!response.ok) {
    throw new Error(`Failed to load skill ${skill.id}: ${response.statusText}`);
  }

  const markdown = await response.text();
  const stripped = stripFrontmatter(markdown);

  // Cache the result
  markdownCache.set(skill.id, stripped);

  return stripped;
}

/**
 * Strip YAML frontmatter from markdown content
 * @param markdown - Markdown string (may have YAML frontmatter)
 * @returns Markdown content without frontmatter
 */
export function stripFrontmatter(markdown: string): string {
  // Check if markdown starts with frontmatter delimiter
  if (!markdown.trim().startsWith('---')) {
    return markdown;
  }

  // Find the closing delimiter
  const lines = markdown.split('\n');
  let endIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    // No closing delimiter found, return as-is
    return markdown;
  }

  // Return content after closing delimiter
  return lines.slice(endIndex + 1).join('\n').trimStart();
}

/**
 * Clear all caches (useful for testing)
 */
export function clearCaches(): void {
  manifestCache = null;
  markdownCache.clear();
}
