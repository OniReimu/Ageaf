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

type TexUsageAgg = Omit<CitationUsage, 'citationKey'>;
type TexUsageCache = {
  projectId: string | null;
  builtAt: number;
  usageByKey: Map<string, TexUsageAgg>;
};

let texUsageCache: TexUsageCache | null = null;
let texUsageInFlight: Promise<TexUsageCache> | null = null;
const TEX_USAGE_TTL_MS = 2 * 60 * 1000;

async function buildTexUsageCache(): Promise<TexUsageCache> {
  const projectId = getProjectIdFromPathname(window.location.pathname);
  const projectFiles = detectProjectFilesHeuristic();
  const texDocs = projectFiles.filter((f: any) => f.ext === 'tex' && f.entityType === 'doc' && typeof f.id === 'string');
  const usageByKey = new Map<string, TexUsageAgg>();

  if (!projectId || texDocs.length === 0) {
    return { projectId, builtAt: Date.now(), usageByKey };
  }

  for (const texFile of texDocs as any[]) {
    try {
      const content = await fetchDocDownload(projectId, texFile.id as string);
      const hits = extractCitationsWithLocations(content);
      for (const { key, line } of hits) {
        const existing = usageByKey.get(key) ?? { usedInFiles: [], totalUsages: 0, isUsed: false };
        let fileEntry = existing.usedInFiles.find((f) => f.fileName === texFile.name);
        if (!fileEntry) {
          fileEntry = {
            filePath: texFile.path,
            fileName: texFile.name,
            occurrences: 0,
            lineNumbers: [],
          };
          existing.usedInFiles.push(fileEntry);
        }
        fileEntry.occurrences++;
        fileEntry.lineNumbers.push(line);
        existing.totalUsages++;
        existing.isUsed = true;
        usageByKey.set(key, existing);
      }
    } catch {
      // ignore per-file failures
    }
  }

  return { projectId, builtAt: Date.now(), usageByKey };
}

async function getTexUsageCache(): Promise<TexUsageCache> {
  const projectId = getProjectIdFromPathname(window.location.pathname);
  if (texUsageCache && texUsageCache.projectId === projectId && Date.now() - texUsageCache.builtAt < TEX_USAGE_TTL_MS) {
    return texUsageCache;
  }
  if (texUsageInFlight) return texUsageInFlight;
  texUsageInFlight = buildTexUsageCache()
    .then((next) => {
      texUsageCache = next;
      return next;
    })
    .finally(() => {
      texUsageInFlight = null;
    });
  return texUsageInFlight;
}

export async function warmTexCitationCache(): Promise<void> {
  try {
    await getTexUsageCache();
  } catch {
    // ignore warm failures
  }
}

export async function analyzeCitations(
  bibContent: string,
  _bibFileName: string
): Promise<CitationAnalysisResult> {
  // Parse .bib file
  const entries = parseBibTeXFile(bibContent);

  // Duplicate title detection (within this bib file)
  const titleBuckets = new Map<string, string[]>();
  for (const entry of entries) {
    const block = bibContent.slice(entry.startPos, Math.min(entry.endPos, bibContent.length));
    const title = extractFieldValue(block, 'title');
    if (!title) continue;
    const norm = normalizeTitle(title);
    if (!norm) continue;
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

  // Initialize usage map with empty entries
  const usageMap = new Map<string, CitationUsage>();
  for (const entry of entries) {
    usageMap.set(entry.key, {
      citationKey: entry.key,
      usedInFiles: [],
      totalUsages: 0,
      isUsed: false,
    });
  }

  // Fill usage map from cached .tex citation scan (non-tab-switching).
  const texUsage = await getTexUsageCache();
  for (const entry of entries) {
    const agg = texUsage.usageByKey.get(entry.key);
    if (!agg) continue;
    usageMap.set(entry.key, {
      citationKey: entry.key,
      usedInFiles: agg.usedInFiles,
      totalUsages: agg.totalUsages,
      isUsed: agg.isUsed,
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
