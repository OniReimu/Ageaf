import { CitationAnalysisResult, CitationUsage, DuplicateTitleInfo } from './types';
import { parseBibTeXFile } from './bibTeXParser';
import { extractCitationsWithLocations } from './latexCitationExtractor';
import { generateCacheKey } from './citationCache';
import { detectProjectFilesHeuristic } from '../../iso/panel/Panel';

function extractFieldValue(entryBlock: string, fieldName: string): string | null {
  // Extremely small BibTeX field extractor good enough for title duplicates.
  // Supports: title = {...} or title = "..." and ignores case/whitespace.
  const re = new RegExp(`(^|[\\s,])${fieldName}\\s*=\\s*`, 'i');
  const m = re.exec(entryBlock);
  if (!m) return null;
  let i = (m.index ?? 0) + m[0].length;
  while (i < entryBlock.length && /\s/.test(entryBlock[i]!)) i++;
  const first = entryBlock[i];
  if (first === '"') {
    i++;
    let out = '';
    while (i < entryBlock.length) {
      const ch = entryBlock[i]!;
      if (ch === '"' && entryBlock[i - 1] !== '\\') break;
      out += ch;
      i++;
    }
    return out;
  }
  if (first === '{') {
    i++;
    let depth = 1;
    let out = '';
    while (i < entryBlock.length && depth > 0) {
      const ch = entryBlock[i]!;
      if (ch === '{') {
        depth++;
        out += ch;
      } else if (ch === '}') {
        depth--;
        if (depth > 0) out += ch;
      } else {
        out += ch;
      }
      i++;
    }
    return out;
  }
  // Fallback: read until comma/newline
  let out = '';
  while (i < entryBlock.length) {
    const ch = entryBlock[i]!;
    if (ch === ',' || ch === '\n' || ch === '\r') break;
    out += ch;
    i++;
  }
  return out.trim() || null;
}

function normalizeTitle(raw: string): string {
  // Normalize per requirement: ignore case, ignore braces `{}`. Also collapse whitespace.
  return raw
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getProjectIdFromPathname(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const idx = segments.findIndex((s) => s.toLowerCase() === 'project');
  if (idx === -1) return null;
  return segments[idx + 1] || null;
}

async function fetchDocDownload(projectId: string, docId: string): Promise<string> {
  // Overleaf CE registers `/Project/:Project_id/doc/:Doc_id/download` on webRouter.
  // Express routing is typically case-insensitive, but we try both to be safe.
  const candidates = [
    `/Project/${encodeURIComponent(projectId)}/doc/${encodeURIComponent(docId)}/download`,
    `/project/${encodeURIComponent(projectId)}/doc/${encodeURIComponent(docId)}/download`,
  ];
  let lastErr: unknown = null;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) {
        lastErr = new Error(`HTTP ${resp.status} for ${url}`);
        continue;
      }
      return await resp.text();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to fetch doc download');
}

export async function analyzeCitations(
  bibContent: string,
  bibFileName: string
): Promise<CitationAnalysisResult> {
  // Parse .bib file
  const entries = parseBibTeXFile(bibContent);

  // Duplicate title detection (within this bib file)
  const titleBuckets = new Map<string, string[]>();
  const titleByKey = new Map<string, string>();
  for (const entry of entries) {
    const block = bibContent.slice(entry.startPos, Math.min(entry.endPos, bibContent.length));
    const title = extractFieldValue(block, 'title');
    if (!title) continue;
    const norm = normalizeTitle(title);
    if (!norm) continue;
    titleByKey.set(entry.key, norm);
    const list = titleBuckets.get(norm) ?? [];
    list.push(entry.key);
    titleBuckets.set(norm, list);
  }
  const duplicateTitleMap = new Map<string, DuplicateTitleInfo>();
  for (const [norm, keys] of titleBuckets.entries()) {
    if (keys.length < 2) continue;
    for (const key of keys) {
      duplicateTitleMap.set(key, {
        normalizedTitle: norm,
        duplicateKeys: keys.filter((k) => k !== key),
      });
    }
  }

  // Discover all .tex files in project
  const projectFiles = detectProjectFilesHeuristic();
  const texFiles = projectFiles.filter(f => f.ext === 'tex');

  // Collect citations from all .tex files
  const usageMap = new Map<string, CitationUsage>();

  // Initialize usage map
  entries.forEach(entry => {
    usageMap.set(entry.key, {
      citationKey: entry.key,
      usedInFiles: [],
      totalUsages: 0,
      isUsed: false
    });
  });

  // Read each .tex file and extract citations (non-tab-switching: fetch doc download by id).
  const projectId = getProjectIdFromPathname(window.location.pathname);
  const fetchableTexDocs = texFiles.filter((f: any) => f?.entityType === 'doc' && typeof f?.id === 'string');

  if (projectId && fetchableTexDocs.length > 0) {
    for (const texFile of fetchableTexDocs) {
      try {
        const content = await fetchDocDownload(projectId, texFile.id as string);
        const citationsWithLines = extractCitationsWithLocations(content);

        citationsWithLines.forEach(({ key, line }) => {
          const usage = usageMap.get(key);
          if (usage) {
            let fileEntry = usage.usedInFiles.find((f) => f.fileName === texFile.name);
            if (!fileEntry) {
              fileEntry = {
                filePath: texFile.path,
                fileName: texFile.name,
                occurrences: 0,
                lineNumbers: [],
              };
              usage.usedInFiles.push(fileEntry);
            }
            fileEntry.occurrences++;
            fileEntry.lineNumbers.push(line);
            usage.totalUsages++;
            usage.isUsed = true;
          }
        });
      } catch (err) {
        console.warn(`Failed to fetch ${texFile.name}:`, err);
      }
    }
  } else {
    // We intentionally do NOT fall back to tab-switching reads here; they cause disruptive UI jumps.
    console.warn('[Ageaf citations] Unable to fetch .tex docs via download endpoint', {
      projectId,
      texCandidates: texFiles.length,
      fetchableTexDocs: fetchableTexDocs.length,
      bibFileName,
    });
  }

  // Generate cache key
  const cacheKey = generateCacheKey(bibContent);

  return {
    entries,
    usageMap,
    duplicateTitleMap,
    cacheKey,
    analyzedAt: Date.now()
  };
}
