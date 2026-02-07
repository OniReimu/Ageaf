import { diffLines } from 'diff';
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

/**
 * Split a file update into per-hunk patches using line-level diffing.
 * Each hunk becomes its own replaceRangeInFile patch with SHORT expectedOldText,
 * making overlay resolution strategies A-B work reliably.
 */
function computePerHunkReplacements(
  filePath: string,
  oldContent: string,
  newContent: string
): Patch[] {
  const oldNorm = normalizeNewlines(oldContent);
  const newNorm = normalizeNewlines(newContent);
  if (oldNorm === newNorm) return [];

  const parts = diffLines(oldNorm, newNorm);
  const patches: Patch[] = [];
  let oldOffset = 0;
  let currentHunk: { from: number; oldParts: string[]; newParts: string[] } | null = null;

  for (const part of parts) {
    if (!part.added && !part.removed) {
      if (currentHunk) {
        const expectedOldText = currentHunk.oldParts.join('');
        const text = currentHunk.newParts.join('');
        patches.push({
          kind: 'replaceRangeInFile',
          filePath,
          expectedOldText,
          text,
          from: currentHunk.from,
          to: currentHunk.from + expectedOldText.length,
        });
        currentHunk = null;
      }
      oldOffset += (part.value ?? '').length;
    } else if (part.removed) {
      if (!currentHunk) {
        currentHunk = { from: oldOffset, oldParts: [], newParts: [] };
      }
      currentHunk.oldParts.push(part.value ?? '');
      oldOffset += (part.value ?? '').length;
    } else if (part.added) {
      if (!currentHunk) {
        currentHunk = { from: oldOffset, oldParts: [], newParts: [] };
      }
      currentHunk.newParts.push(part.value ?? '');
    }
  }

  if (currentHunk) {
    const expectedOldText = currentHunk.oldParts.join('');
    const text = currentHunk.newParts.join('');
    patches.push({
      kind: 'replaceRangeInFile',
      filePath,
      expectedOldText,
      text,
      from: currentHunk.from,
      to: currentHunk.from + expectedOldText.length,
    });
  }

  return patches;
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
    const hunkPatches = computePerHunkReplacements(matched.filePath, matched.content, update.content);
    patches.push(...hunkPatches);
  }

  return patches;
}

