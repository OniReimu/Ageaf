/**
 * Slash parser test exports for Node.js testing
 *
 * Pure function to detect slash command patterns
 */

/**
 * Get slash query from text before cursor
 * @param {string} textBefore - Text before cursor position
 * @param {number} cursorOffset - Current cursor position
 * @returns {{ query: string; start: number; end: number } | null}
 */
function getSlashQuery(textBefore, cursorOffset) {
  // Pattern: (start OR whitespace/bracket) + "/" + (allowed chars)
  // Allowed: A-Za-z0-9._-
  // This avoids matching URLs (https://...) and file paths (path/to/file)
  const match = textBefore.match(/(^|[\s([{])\/([A-Za-z0-9._-]*)$/);

  if (!match) {
    return null;
  }

  const query = match[2] ?? '';
  const start = cursorOffset - (query.length + 1); // +1 for the "/"
  const end = cursorOffset;

  return { query, start, end };
}

module.exports = {
  getSlashQuery,
};
