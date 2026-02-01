/**
 * Test exports for skillsRegistry
 *
 * Pure functions exported for Node.js testing (no browser APIs)
 */

/**
 * Search skills by query (matches name, description, tags)
 */
function searchSkills(skills, query) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return skills;
  }

  const lowerQuery = trimmedQuery.toLowerCase();

  const matches = skills.filter((skill) => {
    const nameMatch = skill.name.toLowerCase().includes(lowerQuery);
    const descMatch = skill.description.toLowerCase().includes(lowerQuery);
    const tagsMatch = skill.tags.some((tag) => tag.toLowerCase().includes(lowerQuery));

    return nameMatch || descMatch || tagsMatch;
  });

  const sorted = matches.sort((a, b) => {
    const aNameLower = a.name.toLowerCase();
    const bNameLower = b.name.toLowerCase();

    const aExact = aNameLower === lowerQuery;
    const bExact = bNameLower === lowerQuery;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aPrefix = aNameLower.startsWith(lowerQuery);
    const bPrefix = bNameLower.startsWith(lowerQuery);
    if (aPrefix && !bPrefix) return -1;
    if (!aPrefix && bPrefix) return 1;

    const aNameMatch = aNameLower.includes(lowerQuery);
    const bNameMatch = bNameLower.includes(lowerQuery);
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;

    return aNameLower.localeCompare(bNameLower);
  });

  return sorted;
}

/**
 * Strip YAML frontmatter from markdown content
 */
function stripFrontmatter(markdown) {
  if (!markdown.trim().startsWith('---')) {
    return markdown;
  }

  const lines = markdown.split('\n');
  let endIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return markdown;
  }

  return lines.slice(endIndex + 1).join('\n').trimStart();
}

module.exports = {
  searchSkills,
  stripFrontmatter,
};
