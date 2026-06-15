import type { JobEvent, Patch } from '../types.js';

type EmitEvent = (event: JobEvent) => void;

const TEXT_FILE_EXTENSIONS = new Set(['.tex', '.sty', '.cls', '.md']);

export type ProjectTextFile = {
  path: string;
  content: string;
};

export type NotationFindingKind =
  | 'acronym_inconsistency'
  | 'symbol_conflict'
  | 'term_drift';

export type NotationSeverity = 'high' | 'medium' | 'low';

export type NotationOccurrence = {
  path: string;
  line: number;
  snippet: string;
};

export type NotationFinding = {
  id: string;
  kind: NotationFindingKind;
  severity: NotationSeverity;
  subject: string;
  canonical: string;
  summary: string;
  conflicts: string[];
  occurrences: NotationOccurrence[];
  suggestedPatches: Array<Patch & { kind: 'replaceRangeInFile' }>;
};

export type NotationAnalysisResult = {
  findings: NotationFinding[];
  filesScanned: number;
  bytesScanned: number;
  skippedFiles: string[];
};

type NotationPayload = {
  context?: {
    attachments?: Array<{
      path?: string;
      name?: string;
      ext?: string;
      content?: string;
    }>;
  };
};

type AcronymOccurrence = {
  acronym: string;
  expansion: string;
  expansionNormalized: string;
  path: string;
  line: number;
  snippet: string;
  from: number;
  to: number;
  fileIndex: number;
  source: 'macro' | 'prose';
};

type AcronymMention = {
  path: string;
  line: number;
  snippet: string;
  from: number;
  to: number;
  fileIndex: number;
};

type SymbolOccurrence = {
  symbol: string;
  meaning: string;
  meaningNormalized: string;
  path: string;
  line: number;
  snippet: string;
};

type TermDriftOccurrence = {
  canonical: string;
  variant: string;
  path: string;
  line: number;
  snippet: string;
  from: number;
  to: number;
};

function normalizeSpaces(value: string) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLower(value: string) {
  return normalizeSpaces(value)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .trim();
}

function normalizeAcronymExpansion(value: string) {
  const normalized = normalizeSpaces(value);
  const stripped = normalized.replace(/^(?:a|an|the)\s+/i, '');
  return stripped || normalized;
}

function lineFromOffset(content: string, offset: number) {
  const limit = Math.max(0, Math.min(content.length, offset));
  let line = 1;
  for (let i = 0; i < limit; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferExt(pathOrName: string) {
  const idx = pathOrName.lastIndexOf('.');
  if (idx < 0) return '';
  return pathOrName.slice(idx).toLowerCase();
}

function toProjectFiles(payload: NotationPayload): {
  files: ProjectTextFile[];
  skippedFiles: string[];
} {
  const attachments = payload.context?.attachments ?? [];
  const byPath = new Map<string, ProjectTextFile>();
  const skippedFiles: string[] = [];

  for (const attachment of attachments) {
    const rawPath = String(attachment.path ?? attachment.name ?? '').trim();
    const content = typeof attachment.content === 'string' ? attachment.content : '';
    if (!rawPath || !content) {
      if (rawPath) skippedFiles.push(rawPath);
      continue;
    }

    const ext = String(attachment.ext ?? inferExt(rawPath)).toLowerCase();
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
    if (!TEXT_FILE_EXTENSIONS.has(normalizedExt)) {
      skippedFiles.push(rawPath);
      continue;
    }

    const key = rawPath.toLowerCase();
    if (byPath.has(key)) continue;
    byPath.set(key, { path: rawPath, content });
  }

  return { files: Array.from(byPath.values()), skippedFiles };
}

function extractAcronymOccurrences(files: ProjectTextFile[]) {
  const occurrences: AcronymOccurrence[] = [];

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    if (!file) continue;
    const text = file.content;

    const newAcronymRegex = /\\newacronym\{[^}]+\}\{([^}]+)\}\{([^}]+)\}/g;
    let macroMatch: RegExpExecArray | null;
    while ((macroMatch = newAcronymRegex.exec(text))) {
      const short = normalizeSpaces(macroMatch[1] ?? '').toUpperCase();
      const long = normalizeAcronymExpansion(macroMatch[2] ?? '');
      if (!short || !long) continue;
      const from = macroMatch.index;
      const to = from + macroMatch[0].length;
      occurrences.push({
        acronym: short,
        expansion: long,
        expansionNormalized: normalizeLower(long),
        path: file.path,
        line: lineFromOffset(text, from),
        snippet: macroMatch[0],
        from,
        to,
        fileIndex,
        source: 'macro',
      });
    }

    const acroRegex = /\\acro\{([^}]+)\}\{([^}]+)\}/g;
    while ((macroMatch = acroRegex.exec(text))) {
      const short = normalizeSpaces(macroMatch[1] ?? '').toUpperCase();
      const long = normalizeAcronymExpansion(macroMatch[2] ?? '');
      if (!short || !long) continue;
      const from = macroMatch.index;
      const to = from + macroMatch[0].length;
      occurrences.push({
        acronym: short,
        expansion: long,
        expansionNormalized: normalizeLower(long),
        path: file.path,
        line: lineFromOffset(text, from),
        snippet: macroMatch[0],
        from,
        to,
        fileIndex,
        source: 'macro',
      });
    }

    // Expansion (ACR) prose pattern, e.g. Large Language Model (LLM)
    const proseRegex = /\b([A-Za-z][A-Za-z0-9/-]*(?:\s+[A-Za-z0-9/-]+){1,8})\s*\(([A-Z]{2,12})\)/g;
    let proseMatch: RegExpExecArray | null;
    while ((proseMatch = proseRegex.exec(text))) {
      const rawExpansion = normalizeAcronymExpansion(proseMatch[1] ?? '');
      const short = normalizeSpaces(proseMatch[2] ?? '').toUpperCase();
      if (!rawExpansion || !short) continue;
      const from = proseMatch.index;
      const to = from + proseMatch[0].length;
      occurrences.push({
        acronym: short,
        expansion: rawExpansion,
        expansionNormalized: normalizeLower(rawExpansion),
        path: file.path,
        line: lineFromOffset(text, from),
        snippet: proseMatch[0],
        from,
        to,
        fileIndex,
        source: 'prose',
      });
    }
  }

  return occurrences;
}

function extractSymbolOccurrences(files: ProjectTextFile[]) {
  const occurrences: SymbolOccurrence[] = [];
  const symbolRegex =
    /\b(?:Let|let|Where|where)\s+\$([A-Za-z])\$\s+(?:denote|denotes|represent|represents|be|is)\s+([^.\n;]+)/g;

  for (const file of files) {
    const text = file.content;
    let match: RegExpExecArray | null;
    while ((match = symbolRegex.exec(text))) {
      const symbol = normalizeSpaces(match[1] ?? '').toLowerCase();
      const meaning = normalizeSpaces(match[2] ?? '');
      if (!symbol || !meaning) continue;
      const from = match.index;
      occurrences.push({
        symbol,
        meaning,
        meaningNormalized: normalizeLower(meaning),
        path: file.path,
        line: lineFromOffset(text, from),
        snippet: normalizeSpaces(match[0]),
      });
    }
  }

  return occurrences;
}

function extractCanonicalTerms(files: ProjectTextFile[]) {
  const terms = new Map<string, string>();

  for (const file of files) {
    const text = file.content;

    const glossaryRegex = /\\newglossaryentry\{[^}]+\}\{[^}]*name=\{([^}]+)\}/g;
    let glossaryMatch: RegExpExecArray | null;
    while ((glossaryMatch = glossaryRegex.exec(text))) {
      const raw = normalizeSpaces(glossaryMatch[1] ?? '');
      if (!raw || !raw.includes('-')) continue;
      const key = normalizeLower(raw).replace(/\s+/g, ' ');
      if (!terms.has(key)) terms.set(key, raw);
    }

    const hyphenRegex = /\b[A-Za-z]+(?:-[A-Za-z]+)+\b/g;
    let hyphenMatch: RegExpExecArray | null;
    while ((hyphenMatch = hyphenRegex.exec(text))) {
      const raw = normalizeSpaces(hyphenMatch[0] ?? '');
      if (!raw || !raw.includes('-')) continue;
      const key = normalizeLower(raw).replace(/\s+/g, ' ');
      if (!terms.has(key)) terms.set(key, raw);
    }
  }

  return terms;
}

function extractTermDriftOccurrences(files: ProjectTextFile[]) {
  const canonicalTerms = extractCanonicalTerms(files);
  const drifts: TermDriftOccurrence[] = [];

  for (const canonical of canonicalTerms.values()) {
    if (!canonical.includes('-')) continue;
    const variant = canonical.replace(/-/g, ' ');
    const variantPattern = new RegExp(
      `\\b${escapeRegExp(variant).replace(/\\ /g, '\\s+')}\\b`,
      'gi'
    );

    for (const file of files) {
      const text = file.content;
      let match: RegExpExecArray | null;
      while ((match = variantPattern.exec(text))) {
        const matched = match[0] ?? '';
        if (!matched) continue;
        const normalizedMatched = normalizeLower(matched).replace(/\s+/g, ' ');
        const normalizedCanonical = normalizeLower(canonical).replace(/\s+/g, ' ');
        if (normalizedMatched === normalizedCanonical) continue;
        const from = match.index;
        const to = from + matched.length;
        drifts.push({
          canonical,
          variant: matched,
          path: file.path,
          line: lineFromOffset(text, from),
          snippet: matched,
          from,
          to,
        });
      }
    }
  }

  return drifts;
}

function compareByDocumentPosition(
  a: { fileIndex: number; from: number },
  b: { fileIndex: number; from: number }
) {
  if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex;
  return a.from - b.from;
}

function overlapsAnyRange(
  from: number,
  to: number,
  ranges: Array<{ from: number; to: number }>
) {
  return ranges.some((range) => from < range.to && range.from < to);
}

function buildAcronymDefinitionRanges(items: AcronymOccurrence[]) {
  const rangesByPath = new Map<string, Array<{ from: number; to: number }>>();
  for (const item of items) {
    const ranges = rangesByPath.get(item.path) ?? [];
    ranges.push({ from: item.from, to: item.to });
    rangesByPath.set(item.path, ranges);
  }
  return rangesByPath;
}

function collectStandaloneAcronymMentions(
  files: ProjectTextFile[],
  acronym: string,
  definitionRangesByPath: Map<string, Array<{ from: number; to: number }>>
) {
  const mentions: AcronymMention[] = [];
  const pattern = new RegExp(`\\b${escapeRegExp(acronym)}\\b`, 'g');

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    if (!file) continue;
    const ranges = definitionRangesByPath.get(file.path) ?? [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(file.content))) {
      const snippet = match[0] ?? '';
      if (!snippet) continue;
      const from = match.index;
      const to = from + snippet.length;
      if (overlapsAnyRange(from, to, ranges)) continue;
      mentions.push({
        path: file.path,
        line: lineFromOffset(file.content, from),
        snippet,
        from,
        to,
        fileIndex,
      });
    }
  }

  return mentions;
}

function collectFullExpansionMentions(
  files: ProjectTextFile[],
  expansion: string,
  definitionRangesByPath: Map<string, Array<{ from: number; to: number }>>
) {
  const mentions: AcronymMention[] = [];
  const expansionPattern = new RegExp(
    `\\b${escapeRegExp(expansion).replace(/\\ /g, '\\s+')}\\b`,
    'gi'
  );

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    if (!file) continue;
    const ranges = definitionRangesByPath.get(file.path) ?? [];
    let match: RegExpExecArray | null;
    while ((match = expansionPattern.exec(file.content))) {
      const snippet = match[0] ?? '';
      if (!snippet) continue;
      const from = match.index;
      const to = from + snippet.length;
      if (overlapsAnyRange(from, to, ranges)) continue;
      mentions.push({
        path: file.path,
        line: lineFromOffset(file.content, from),
        snippet,
        from,
        to,
        fileIndex,
      });
    }
  }

  return mentions;
}

function buildAcronymFindings(
  occurrences: AcronymOccurrence[],
  files: ProjectTextFile[]
): NotationFinding[] {
  const byAcronym = new Map<string, AcronymOccurrence[]>();

  for (const occurrence of occurrences) {
    const key = occurrence.acronym;
    const list = byAcronym.get(key) ?? [];
    list.push(occurrence);
    byAcronym.set(key, list);
  }

  const findings: NotationFinding[] = [];
  for (const [acronym, items] of byAcronym.entries()) {
    const sortedItems = [...items].sort(compareByDocumentPosition);
    const canonicalOccurrence = sortedItems[0];
    if (!canonicalOccurrence) continue;

    const canonicalExpansion = canonicalOccurrence.expansion;
    const canonicalExpansionKey = canonicalOccurrence.expansionNormalized;
    const definitionRangesByPath = buildAcronymDefinitionRanges(sortedItems);

    const variants = new Map<string, string>();
    for (const item of sortedItems) {
      if (!item.expansionNormalized) continue;
      if (!variants.has(item.expansionNormalized)) {
        variants.set(item.expansionNormalized, item.expansion);
      }
    }

    if (variants.size > 1) {
      const conflicts = Array.from(variants.entries())
        .filter(([variantKey]) => variantKey !== canonicalExpansionKey)
        .map(([, display]) => display);
      const suggestedPatches: Array<Patch & { kind: 'replaceRangeInFile' }> = [];

      for (const item of sortedItems) {
        if (
          item.source === 'prose' &&
          item.expansionNormalized !== canonicalExpansionKey &&
          item.from < item.to
        ) {
          suggestedPatches.push({
            kind: 'replaceRangeInFile',
            filePath: item.path,
            expectedOldText: item.snippet,
            text: `${canonicalExpansion} (${acronym})`,
            from: item.from,
            to: item.to,
            lineFrom: item.line,
          });
        }
      }

      findings.push({
        id: `acronym:${acronym}`,
        kind: 'acronym_inconsistency',
        severity: 'high',
        subject: acronym,
        canonical: canonicalExpansion,
        summary: `Acronym ${acronym} has conflicting expansions.`,
        conflicts,
        occurrences: sortedItems.map((item) => ({
          path: item.path,
          line: item.line,
          snippet: item.snippet,
        })),
        suggestedPatches,
      });
    }

    const preDefinitionMentions = collectStandaloneAcronymMentions(
      files,
      acronym,
      definitionRangesByPath
    ).filter(
      (mention) => compareByDocumentPosition(mention, canonicalOccurrence) < 0
    );
    if (preDefinitionMentions.length > 0) {
      findings.push({
        id: `acronym:${acronym}:define-before-use`,
        kind: 'acronym_inconsistency',
        severity: 'high',
        subject: acronym,
        canonical: `${canonicalExpansion} (${acronym})`,
        summary: `Acronym ${acronym} is used before its first definition.`,
        conflicts: [
          `Define "${canonicalExpansion} (${acronym})" before standalone "${acronym}" usage.`,
        ],
        occurrences: [
          ...preDefinitionMentions.map((mention) => ({
            path: mention.path,
            line: mention.line,
            snippet: mention.snippet,
          })),
          {
            path: canonicalOccurrence.path,
            line: canonicalOccurrence.line,
            snippet: canonicalOccurrence.snippet,
          },
        ],
        suggestedPatches: [],
      });
    }

    const repeatedFullMentions = collectFullExpansionMentions(
      files,
      canonicalExpansion,
      definitionRangesByPath
    ).filter(
      (mention) => compareByDocumentPosition(mention, canonicalOccurrence) > 0
    );
    if (repeatedFullMentions.length > 0) {
      findings.push({
        id: `acronym:${acronym}:prefer-short-form`,
        kind: 'acronym_inconsistency',
        severity: 'medium',
        subject: acronym,
        canonical: acronym,
        summary: `After introducing ${canonicalExpansion} (${acronym}), use ${acronym} for subsequent mentions.`,
        conflicts: Array.from(
          new Set(repeatedFullMentions.map((mention) => normalizeSpaces(mention.snippet)))
        ),
        occurrences: [
          {
            path: canonicalOccurrence.path,
            line: canonicalOccurrence.line,
            snippet: canonicalOccurrence.snippet,
          },
          ...repeatedFullMentions.map((mention) => ({
            path: mention.path,
            line: mention.line,
            snippet: mention.snippet,
          })),
        ],
        suggestedPatches: repeatedFullMentions.map((mention) => ({
          kind: 'replaceRangeInFile',
          filePath: mention.path,
          expectedOldText: mention.snippet,
          text: acronym,
          from: mention.from,
          to: mention.to,
          lineFrom: mention.line,
        })),
      });
    }
  }

  return findings;
}

function buildSymbolFindings(occurrences: SymbolOccurrence[]): NotationFinding[] {
  const bySymbol = new Map<string, SymbolOccurrence[]>();
  for (const occurrence of occurrences) {
    const list = bySymbol.get(occurrence.symbol) ?? [];
    list.push(occurrence);
    bySymbol.set(occurrence.symbol, list);
  }

  const findings: NotationFinding[] = [];
  for (const [symbol, items] of bySymbol.entries()) {
    const meanings = new Map<string, string>();
    for (const item of items) {
      if (!meanings.has(item.meaningNormalized)) {
        meanings.set(item.meaningNormalized, item.meaning);
      }
    }
    if (meanings.size <= 1) continue;

    const canonical = items[0]?.meaning ?? '';
    findings.push({
      id: `symbol:${symbol}`,
      kind: 'symbol_conflict',
      severity: 'high',
      subject: `$${symbol}$`,
      canonical,
      summary: `Symbol $${symbol}$ is defined with multiple meanings.`,
      conflicts: Array.from(meanings.values()).filter((meaning) => meaning !== canonical),
      occurrences: items.map((item) => ({
        path: item.path,
        line: item.line,
        snippet: item.snippet,
      })),
      suggestedPatches: [],
    });
  }

  return findings;
}

function buildTermDriftFindings(
  occurrences: TermDriftOccurrence[]
): NotationFinding[] {
  const byCanonical = new Map<string, TermDriftOccurrence[]>();
  for (const occurrence of occurrences) {
    const list = byCanonical.get(occurrence.canonical) ?? [];
    list.push(occurrence);
    byCanonical.set(occurrence.canonical, list);
  }

  const findings: NotationFinding[] = [];
  for (const [canonical, items] of byCanonical.entries()) {
    if (items.length === 0) continue;
    const conflicts = Array.from(
      new Set(items.map((item) => normalizeSpaces(item.variant)))
    );
    findings.push({
      id: `term:${canonical.toLowerCase()}`,
      kind: 'term_drift',
      severity: 'medium',
      subject: canonical,
      canonical,
      summary: `Term formatting drift detected for "${canonical}".`,
      conflicts,
      occurrences: items.map((item) => ({
        path: item.path,
        line: item.line,
        snippet: item.snippet,
      })),
      suggestedPatches: items
        .filter((item) => item.from < item.to)
        .map((item) => ({
          kind: 'replaceRangeInFile',
          filePath: item.path,
          expectedOldText: item.variant,
          text: canonical,
          from: item.from,
          to: item.to,
          lineFrom: item.line,
        })),
    });
  }

  return findings;
}

export function analyzeNotationConsistencyFiles(
  files: ProjectTextFile[]
): NotationAnalysisResult {
  const bytesScanned = files.reduce((sum, file) => sum + file.content.length, 0);
  const acronymOccurrences = extractAcronymOccurrences(files);
  const symbolOccurrences = extractSymbolOccurrences(files);
  const termDriftOccurrences = extractTermDriftOccurrences(files);

  const findings = [
    ...buildAcronymFindings(acronymOccurrences, files),
    ...buildSymbolFindings(symbolOccurrences),
    ...buildTermDriftFindings(termDriftOccurrences),
  ];

  return {
    findings,
    filesScanned: files.length,
    bytesScanned,
    skippedFiles: [],
  };
}

export function buildNotationDraftPatches(findings: NotationFinding[]) {
  const patches: Array<Patch & { kind: 'replaceRangeInFile' }> = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    for (const patch of finding.suggestedPatches) {
      const key = [
        patch.filePath.toLowerCase(),
        String(patch.from ?? ''),
        String(patch.to ?? ''),
        patch.expectedOldText,
        patch.text,
      ].join('::');
      if (seen.has(key)) continue;
      seen.add(key);
      patches.push(patch);
    }
  }

  patches.sort((a, b) => {
    const pathCmp = a.filePath.localeCompare(b.filePath);
    if (pathCmp !== 0) return pathCmp;
    return (a.from ?? 0) - (b.from ?? 0);
  });

  return patches;
}

function formatSummary(analysis: NotationAnalysisResult, includeDraftHint: boolean) {
  const byKind = new Map<NotationFindingKind, number>([
    ['acronym_inconsistency', 0],
    ['symbol_conflict', 0],
    ['term_drift', 0],
  ]);

  for (const finding of analysis.findings) {
    byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
  }

  const lines: string[] = [
    `Notation consistency scan complete: ${analysis.findings.length} finding(s) across ${analysis.filesScanned} file(s).`,
    `- Acronym inconsistencies: ${byKind.get('acronym_inconsistency') ?? 0}`,
    `- Symbol conflicts: ${byKind.get('symbol_conflict') ?? 0}`,
    `- Term drift: ${byKind.get('term_drift') ?? 0}`,
  ];

  if (analysis.findings.length > 0) {
    lines.push('');
    lines.push('Top findings:');
    for (const finding of analysis.findings.slice(0, 12)) {
      const refs = finding.occurrences
        .slice(0, 3)
        .map((occ) => `${occ.path}:${occ.line}`)
        .join(', ');
      lines.push(
        `- [${finding.severity}] ${finding.kind} on ${finding.subject}: ${finding.summary}${refs ? ` (${refs})` : ''}`
      );
    }
  }

  if (includeDraftHint) {
    lines.push('');
    lines.push('Draft fixes were emitted as review cards. Accept/reject each patch before applying.');
  }

  return lines.join('\n');
}

function buildAnalysisFromPayload(payload: NotationPayload) {
  const { files, skippedFiles } = toProjectFiles(payload);
  const analysis = analyzeNotationConsistencyFiles(files);
  return {
    files,
    analysis: {
      ...analysis,
      skippedFiles,
    },
  };
}

export async function runNotationConsistencyCheck(
  payload: NotationPayload,
  emitEvent: EmitEvent
) {
  emitEvent({ event: 'delta', data: { text: 'Running notation consistency pass...' } });

  const { files, analysis } = buildAnalysisFromPayload(payload);
  if (files.length === 0) {
    emitEvent({
      event: 'done',
      data: {
        status: 'error',
        message:
          'No text attachments were provided for notation analysis. Attach project files and retry.',
      },
    });
    return;
  }

  emitEvent({
    event: 'delta',
    data: { text: formatSummary(analysis, false) },
  });
  emitEvent({
    event: 'done',
    data: { status: 'ok', findings: analysis.findings.length },
  });
}

export async function runNotationDraftFixes(
  payload: NotationPayload,
  emitEvent: EmitEvent
) {
  emitEvent({ event: 'delta', data: { text: 'Generating notation draft fixes...' } });

  const { files, analysis } = buildAnalysisFromPayload(payload);
  if (files.length === 0) {
    emitEvent({
      event: 'done',
      data: {
        status: 'error',
        message:
          'No text attachments were provided for notation draft fixes. Attach project files and retry.',
      },
    });
    return;
  }

  const patches = buildNotationDraftPatches(analysis.findings);
  if (patches.length === 0) {
    emitEvent({
      event: 'delta',
      data: {
        text: 'No safe notation draft fixes were generated from the current findings.',
      },
    });
  } else {
    for (const patch of patches) {
      emitEvent({ event: 'patch', data: patch });
    }
  }

  emitEvent({
    event: 'delta',
    data: { text: formatSummary(analysis, true) },
  });
  emitEvent({
    event: 'done',
    data: { status: 'ok', findings: analysis.findings.length, patches: patches.length },
  });
}
