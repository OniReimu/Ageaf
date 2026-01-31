import type { Patch } from '../types.js';

type ExtractedOverleafFile = { filePath: string; content: string };

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function getBaseName(filePath: string) {
  const trimmed = filePath.trim();
  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : trimmed;
}

export function extractOverleafFilesFromMessage(message: string): ExtractedOverleafFile[] {
  const results: ExtractedOverleafFile[] = [];
  const normalized = normalizeNewlines(message);
  const re = /\[Overleaf file:\s*([^\]\n]+)\]\n```[^\n]*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized))) {
    const filePath = String(match[1] ?? '').trim();
    const content = String(match[2] ?? '');
    if (!filePath) continue;
    results.push({ filePath, content });
  }
  return results;
}

export function extractFileUpdateMarkers(output: string) {
  const normalized = normalizeNewlines(output);
  const updates: Array<{ filePath: string; content: string }> = [];
  const re =
    /<<<\s*AGEAF_FILE_UPDATE\s+path="([^"]+)"\s*>>>\s*\n([\s\S]*?)\n<<<\s*AGEAF_FILE_UPDATE_END\s*>>>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized))) {
    const filePath = String(match[1] ?? '').trim();
    const content = String(match[2] ?? '');
    if (!filePath) continue;
    updates.push({ filePath, content });
  }
  return updates;
}

function findOverleafFileContent(
  targetPath: string,
  files: ExtractedOverleafFile[]
): ExtractedOverleafFile | null {
  const trimmed = targetPath.trim();
  if (!trimmed) return null;
  const exact = files.find((entry) => entry.filePath === trimmed);
  if (exact) return exact;

  const base = getBaseName(trimmed);
  const baseMatches = files.filter((entry) => getBaseName(entry.filePath) === base);
  if (baseMatches.length === 1) return baseMatches[0] ?? null;
  if (files.length === 1) return files[0] ?? null;
  return null;
}

function computeSingleReplacement(oldText: string, newText: string) {
  const oldNormalized = normalizeNewlines(oldText);
  const newNormalized = normalizeNewlines(newText);
  if (oldNormalized === newNormalized) return null;

  const oldLen = oldNormalized.length;
  const newLen = newNormalized.length;
  let prefix = 0;
  while (prefix < oldLen && prefix < newLen && oldNormalized[prefix] === newNormalized[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < oldLen - prefix &&
    suffix < newLen - prefix &&
    oldNormalized[oldLen - 1 - suffix] === newNormalized[newLen - 1 - suffix]
  ) {
    suffix += 1;
  }

  const from = prefix;
  const to = oldLen - suffix;
  const expectedOldText = oldNormalized.slice(from, to);
  const text = newNormalized.slice(from, newLen - suffix);
  return { from, to, expectedOldText, text };
}

export function buildReplaceRangePatchesFromFileUpdates(args: {
  output: string;
  message: string;
}): Patch[] {
  const files = extractOverleafFilesFromMessage(args.message);
  const updates = extractFileUpdateMarkers(args.output);

  const patches: Patch[] = [];
  for (const update of updates) {
    const matched = findOverleafFileContent(update.filePath, files);
    if (!matched) continue;
    const replacement = computeSingleReplacement(matched.content, update.content);
    if (!replacement) continue;
    patches.push({
      kind: 'replaceRangeInFile',
      filePath: matched.filePath,
      expectedOldText: replacement.expectedOldText,
      text: replacement.text,
      from: replacement.from,
      to: replacement.to,
    });
  }

  return patches;
}

