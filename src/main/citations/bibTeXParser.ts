import { BibEntry } from './types';

export function parseBibTeXFile(content: string): BibEntry[] {
  const entries: BibEntry[] = [];

  // Match @article{key, @book{key, etc.
  const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)/g;

  let match;
  while ((match = entryRegex.exec(content)) !== null) {
    const key = match[2];
    const startPos = match.index;

    // Find matching closing brace
    let braceCount = 1;
    let endPos = match.index + match[0].length;
    while (braceCount > 0 && endPos < content.length) {
      if (content[endPos] === '{') braceCount++;
      if (content[endPos] === '}') braceCount--;
      endPos++;
    }

    // Calculate line number
    const lineNumber = content.substring(0, startPos).split('\n').length;

    entries.push({ key, startPos, endPos, lineNumber });
  }

  return entries;
}
