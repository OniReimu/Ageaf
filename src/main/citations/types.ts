export interface BibEntry {
  key: string;           // Citation key (e.g., "smith2020")
  startPos: number;      // Start position in .bib file
  endPos: number;        // End position in .bib file
  lineNumber: number;    // Line number for the @entry line
}

export interface CitationUsage {
  citationKey: string;
  usedInFiles: Array<{
    filePath: string;
    fileName: string;
    occurrences: number;
    lineNumbers: number[];
  }>;
  totalUsages: number;
  isUsed: boolean;
}

export interface DuplicateTitleInfo {
  normalizedTitle: string;
  duplicateKeys: string[]; // other keys with the same normalized title
}

export interface CitationAnalysisResult {
  entries: BibEntry[];
  usageMap: Map<string, CitationUsage>;
  duplicateTitleMap: Map<string, DuplicateTitleInfo>;
  cacheKey: string;      // Content hash for cache invalidation
  analyzedAt: number;    // Timestamp
}
