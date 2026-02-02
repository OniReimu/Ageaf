import { CitationAnalysisResult } from './types';

interface CacheEntry {
  result: CitationAnalysisResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function generateCacheKey(bibContent: string): string {
  // Same hashing strategy as bridge.ts
  return `${bibContent.length}:${bibContent.slice(0, 64)}:${bibContent.slice(-64)}`;
}

export function getCachedAnalysis(cacheKey: string): CitationAnalysisResult | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }

  return entry.result;
}

export function setCachedAnalysis(cacheKey: string, result: CitationAnalysisResult) {
  cache.set(cacheKey, {
    result,
    expiresAt: Date.now() + CACHE_TTL
  });
}

export function clearCache() {
  cache.clear();
}
