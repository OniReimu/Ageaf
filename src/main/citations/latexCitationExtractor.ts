export function extractCitations(texContent: string): string[] {
  const citations = new Set<string>();

  // Match \cite{...}, \citep{...}, \citet{...}, \nocite{...}, etc.
  const citeRegex = /\\(?:cite|citep|citet|citealt|citealp|nocite|citeauthor|citeyear)\*?\s*(?:\[.*?\])?\s*\{([^}]+)\}/g;

  let match;
  while ((match = citeRegex.exec(texContent)) !== null) {
    // Handle multiple keys in one command: \cite{key1,key2,key3}
    const keys = match[1].split(',').map(k => k.trim()).filter(Boolean);
    keys.forEach(key => citations.add(key));
  }

  return Array.from(citations);
}

export function extractCitationsWithLocations(texContent: string) {
  const results: Array<{ key: string; line: number }> = [];
  const lines = texContent.split('\n');

  lines.forEach((line, lineIndex) => {
    const citeRegex = /\\(?:cite|citep|citet|citealt|citealp|nocite|citeauthor|citeyear)\*?\s*(?:\[.*?\])?\s*\{([^}]+)\}/g;
    let match;

    while ((match = citeRegex.exec(line)) !== null) {
      const keys = match[1].split(',').map(k => k.trim()).filter(Boolean);
      keys.forEach(key => {
        results.push({ key, line: lineIndex + 1 });
      });
    }
  });

  return results;
}
