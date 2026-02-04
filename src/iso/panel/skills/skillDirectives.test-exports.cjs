/**
 * Skill directive extraction and stripping (test exports)
 *
 * Pure functions to extract and remove /skillName directives from text
 */

/**
 * Extract skill directives from text
 * @param {string} text - Message text with potential directives
 * @returns {string[]} Array of unique skill names (without leading /)
 */
function extractSkillDirectives(text) {
  // Pattern: (start OR whitespace/bracket) + "/" + (allowed chars)
  // Same as slash menu pattern but global
  const pattern = /(^|[\s([{])\/\s*([A-Za-z0-9._-]+)(\s|$|[\s)\]}.,;!?])/g;

  const matches = text.matchAll(pattern);
  const directives = [];
  const seen = new Set();

  for (const match of matches) {
    const skillName = match[2];
    if (skillName && !seen.has(skillName)) {
      directives.push(skillName);
      seen.add(skillName);
    }
  }

  return directives;
}

/**
 * Strip skill directives from text
 * @param {string} text - Message text with directives
 * @returns {string} Text with directives removed
 */
function stripSkillDirectives(text) {
  // Same pattern as extraction
  const pattern = /(^|[\s([{])\/\s*([A-Za-z0-9._-]+)(\s|$|[\s)\]}.,;!?])/g;

  // Replace directives with the surrounding characters (preserve whitespace/punctuation)
  return text.replace(pattern, (match, before, skillName, after) => {
    // Keep the before context (whitespace/bracket) and after context
    return before + after;
  });
}

module.exports = {
  extractSkillDirectives,
  stripSkillDirectives,
};
