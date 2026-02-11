/**
 * Pure extraction helpers for rewrite output processing.
 * Zero dependencies — these are standalone string parsers.
 * Used by both Claude (rewriteSelection.ts) and Pi (pi/run.ts) runtimes.
 */

export const REWRITE_START = '<<<AGEAF_REWRITE>>>';
export const REWRITE_END = '<<<AGEAF_REWRITE_END>>>';

export const REWRITE_PROMPT = `Rewrite the selected LaTeX text for clarity and academic tone.
Preserve all LaTeX commands, citations (e.g., \\cite{}), labels (\\label{}), references (\\ref{}), and math.

Output ONLY the rewritten selection between the markers below (no JSON, no Markdown, no explanation):
${REWRITE_START}
... rewritten selection here ...
${REWRITE_END}`;

export function buildRewritePrompt(payload: {
  context?: {
    selection?: string;
    surroundingBefore?: string;
    surroundingAfter?: string;
  };
}) {
  const selection = payload.context?.selection ?? '';
  const before = payload.context?.surroundingBefore ?? '';
  const after = payload.context?.surroundingAfter ?? '';

  return [
    REWRITE_PROMPT,
    '\n\nContext before:\n```latex\n',
    before,
    '\n```\n\nSelection:\n```latex\n',
    selection,
    '\n```\n\nContext after:\n```latex\n',
    after,
    '\n```\n',
  ].join('');
}

function extractBetweenMarkers(resultText: string) {
  const startIndex = resultText.indexOf(REWRITE_START);
  if (startIndex < 0) return null;
  const endIndex = resultText.indexOf(REWRITE_END, startIndex + REWRITE_START.length);
  if (endIndex < 0) return null;
  const body = resultText.slice(startIndex + REWRITE_START.length, endIndex).trim();
  return body.length > 0 ? body : null;
}

function extractFromUnclosedMarkers(resultText: string) {
  const startIndex = resultText.indexOf(REWRITE_START);
  const endIndex = resultText.indexOf(REWRITE_END);
  if (startIndex >= 0 && endIndex < 0) {
    const body = resultText.slice(startIndex + REWRITE_START.length).trim();
    return body.length > 0 ? body : null;
  }
  if (endIndex >= 0 && startIndex < 0) {
    const body = resultText.slice(0, endIndex).trim();
    return body.length > 0 ? body : null;
  }
  return null;
}

function extractLastFencedBlock(resultText: string) {
  const fence = /```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null = null;
  let last: string | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((match = fence.exec(resultText))) {
    const body = (match[1] ?? '').trim();
    if (body) last = body;
  }
  return last;
}

function extractTrailingText(resultText: string) {
  const lines = resultText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) break;
    const isBullet =
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      trimmed.startsWith('\u2022 ') ||
      /^\d+\.\s+/.test(trimmed);
    if (!isBullet) break;
    i += 1;
  }
  while (i < lines.length && !(lines[i] ?? '').trim()) i += 1;
  const rest = lines.slice(i).join('\n').trim();
  if (rest) return rest;

  const blocks = resultText
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const last = blocks.length > 0 ? blocks[blocks.length - 1] : '';
  return last || null;
}

export function extractRewriteTextWithFallback(resultText: string | null) {
  if (!resultText) return { text: null, usedFallback: false };

  const between = extractBetweenMarkers(resultText);
  if (between) return { text: between, usedFallback: false };

  const unclosed = extractFromUnclosedMarkers(resultText);
  if (unclosed) return { text: unclosed, usedFallback: true };

  const fenced = extractLastFencedBlock(resultText);
  if (fenced) return { text: fenced, usedFallback: true };

  const trailing = extractTrailingText(resultText);
  if (trailing) return { text: trailing, usedFallback: true };

  return { text: null, usedFallback: true };
}
