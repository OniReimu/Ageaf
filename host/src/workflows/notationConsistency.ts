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
  source: 'macro' | 'prose';
  order: number;
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
  let order = 0;

  for (const file of files) {
    const text = file.content;

    const newAcronymRegex = /\\newacronym\{[^}]+\}\{([^}]+)\}\{([^}]+)\}/g;
    let macroMatch: RegExpExecArray | null;
    while ((macroMatch = newAcronymRegex.exec(text))) {
      const short = normalizeSpaces(macroMatch[1] ?? '').toUpperCase();
      const long = normalizeSpaces(macroMatch[2] ?? '');
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
        source: 'macro',
        order: order += 1,
      });
    }

    const acroRegex = /\\acro\{([^}]+)\}\{([^}]+)\}/g;
    while ((macroMatch = acroRegex.exec(text))) {
      const short = normalizeSpaces(macroMatch[1] ?? '').toUpperCase();
      const long = normalizeSpaces(macroMatch[2] ?? '');
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
        source: 'macro',
        order: order += 1,
      });
    }

    // Expansion (ACR) prose pattern, e.g. Large Language Model (LLM)
    const proseRegex = /\b([A-Za-z][A-Za-z0-9/-]*(?:\s+[A-Za-z0-9/-]+){1,8})\s*\(([A-Z]{2,12})\)/g;
    let proseMatch: RegExpExecArray | null;
    while ((proseMatch = proseRegex.exec(text))) {
      const rawExpansion = normalizeSpaces(proseMatch[1] ?? '');
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
        source: 'prose',
        order: order += 1,
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

function buildAcronymFindings(
  occurrences: AcronymOccurrence[]
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
    const variants = new Map<string, string>();
    const firstByVariant = new Map<string, AcronymOccurrence>();

    for (const item of items) {
      if (!item.expansionNormalized) continue;
      if (!variants.has(item.expansionNormalized)) {
        variants.set(item.expansionNormalized, item.expansion);
        firstByVariant.set(item.expansionNormalized, item);
      }
    }

    if (variants.size <= 1) continue;

    const sorted = Array.from(firstByVariant.values()).sort(
      (a, b) => a.order - b.order
    );
    const canonicalOccurrence = sorted[0];
    if (!canonicalOccurrence) continue;

    const canonical = canonicalOccurrence.expansion;
    const canonicalKey = canonicalOccurrence.expansionNormalized;
    const conflicts = Array.from(variants.entries())
      .filter(([variantKey]) => variantKey !== canonicalKey)
      .map(([, display]) => display);

    const findingOccurrences: NotationOccurrence[] = [];
    const suggestedPatches: Array<Patch & { kind: 'replaceRangeInFile' }> = [];

    for (const item of items) {
      findingOccurrences.push({
        path: item.path,
        line: item.line,
        snippet: item.snippet,
      });

      if (
        item.source === 'prose' &&
        item.expansionNormalized !== canonicalKey &&
        item.from < item.to
      ) {
        suggestedPatches.push({
          kind: 'replaceRangeInFile',
          filePath: item.path,
          expectedOldText: item.snippet,
          text: `${canonical} (${acronym})`,
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
      canonical,
      summary: `Acronym ${acronym} has conflicting expansions.`,
      conflicts,
      occurrences: findingOccurrences,
      suggestedPatches,
    });
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
    ...buildAcronymFindings(acronymOccurrences),
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
