// Regex pattern for matching LaTeX citation commands
// Matches \cite{...}, \citep{...}, \citet{...}, \nocite{...}, etc.
const CITE_PATTERN = /\\(?:cite|citep|citet|citealt|citealp|nocite|citeauthor|citeyear)\*?\s*(?:\[.*?\])?\s*\{([^}]+)\}/g;

function createCiteRegex(): RegExp {
  return new RegExp(CITE_PATTERN.source, CITE_PATTERN.flags);
}

function parseKeysFromMatch(match: RegExpExecArray): string[] {
  return match[1].split(',').map((k) => k.trim()).filter(Boolean);
}

export function extractCitations(texContent: string): string[] {
  const citations = new Set<string>();
  const regex = createCiteRegex();

  let match;
  while ((match = regex.exec(texContent)) !== null) {
    for (const key of parseKeysFromMatch(match)) {
      citations.add(key);
    }
  }

  return Array.from(citations);
}

export function extractCitationsWithLocations(texContent: string): Array<{ key: string; line: number }> {
  const results: Array<{ key: string; line: number }> = [];
  const lines = texContent.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const regex = createCiteRegex();
    const line = lines[lineIndex]!;
    let match;

    while ((match = regex.exec(line)) !== null) {
      for (const key of parseKeysFromMatch(match)) {
        results.push({ key, line: lineIndex + 1 });
      }
    }
  }

  return results;
}
