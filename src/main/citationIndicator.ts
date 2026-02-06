import { getCmView } from './helpers';
import { initCitationDecorations, type Cm6ExportsLite, type CitationDecorations } from './citations/citationDecorations';
import { analyzeCitations, warmTexCitationCache } from './citations/citationAnalyzer';
import { generateCacheKey, getCachedAnalysis, setCachedAnalysis } from './citations/citationCache';
import { parseBibTeXFile } from './citations/bibTeXParser';

let analysisInProgress = false;
let installedViews: WeakSet<any> | null = null;
let lastInstallAttemptAt = 0;
let lastActiveFile: string | null = null;
let lastBibUpdateAt = 0;
let lastBibHash: string | null = null;
let lastBibActive = false;

const STYLE_ID = 'ageaf-citation-indicator-style';

type OverleafExtensionsEvent = CustomEvent<{
  CodeMirror?: any;
}>;

let cm6: Cm6ExportsLite | null = null;
let decorations: CitationDecorations | null = null;

function tryAdoptGlobalCm6() {
  try {
    const global = (window as any).__ageafCm6Exports as Cm6ExportsLite | undefined;
    if (!global) return false;
    cm6 = global;
    if (!decorations) decorations = initCitationDecorations(cm6);
    return true;
  } catch {
    return false;
  }
}

function isDebugEnabled() {
  try {
    return window.localStorage.getItem('ageaf_debug_citations') === '1';
  } catch {
    return false;
  }
}

function logDebug(...args: any[]) {
  if (!isDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[Ageaf Citations]', ...args);
}

function looksLikeBibContent(text: string): boolean {
  try {
    return parseBibTeXFile(text).length > 0;
  } catch {
    return false;
  }
}

function isBibFile(fileName: string | null, content: string): boolean {
  const hasBibExtension = !!fileName?.toLowerCase().endsWith('.bib');
  return hasBibExtension || looksLikeBibContent(content);
}

function safeGetCmView(): any | null {
  try {
    return getCmView();
  } catch {
    return null;
  }
}

function isCitationFieldInstalled(view: any): boolean {
  if (!decorations?.citationDecorationField) return false;
  try {
    // state.field(field, false) returns undefined when not present
    return view?.state?.field?.(decorations.citationDecorationField, false) != null;
  } catch {
    return false;
  }
}

function ensureCitationStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Citation usage indicators (editor widgets) — Emerald Studio palette */
    .ageaf-citation-indicator {
      display: inline-block;
      margin-left: 8px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      cursor: default;
      user-select: none;
      transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
      animation: ageaf-cite-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards;
    }

    .ageaf-citation-used {
      color: #39b98a;
      background-color: rgba(57, 185, 138, 0.14);
      border: 1px solid rgba(57, 185, 138, 0.4);
    }

    .ageaf-citation-used:hover {
      background-color: rgba(57, 185, 138, 0.22);
      border-color: rgba(57, 185, 138, 0.5);
    }

    .ageaf-citation-unused {
      color: #7f9389;
      background-color: rgba(107, 125, 115, 0.12);
      border: 1px solid rgba(107, 125, 115, 0.3);
      opacity: 0.65;
    }

    .ageaf-citation-unused:hover {
      opacity: 0.85;
      background-color: rgba(107, 125, 115, 0.18);
    }

    /* Dark mode support (Overleaf uses body.dark in some themes; keep both) */
    .dark .ageaf-citation-used, body.dark .ageaf-citation-used {
      color: #4dd4a4;
      background-color: rgba(57, 185, 138, 0.10);
      border-color: rgba(57, 185, 138, 0.3);
    }

    .dark .ageaf-citation-unused, body.dark .ageaf-citation-unused {
      color: #a8bfb3;
      background-color: rgba(107, 125, 115, 0.08);
      border-color: rgba(107, 125, 115, 0.2);
    }

    /* Duplicate title indicator */
    .ageaf-citation-dup {
      display: inline-block;
      margin-left: 6px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      font-family: 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      cursor: default;
      user-select: none;
      color: #ffb357;
      background-color: rgba(255, 179, 87, 0.14);
      border: 1px solid rgba(255, 179, 87, 0.4);
      transition: background-color 0.15s ease, border-color 0.15s ease;
      animation: ageaf-cite-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards;
    }

    .ageaf-citation-dup:hover {
      background-color: rgba(255, 179, 87, 0.22);
      border-color: rgba(255, 179, 87, 0.5);
    }

    .dark .ageaf-citation-dup, body.dark .ageaf-citation-dup {
      color: #ffb357;
      background-color: rgba(255, 179, 87, 0.10);
      border-color: rgba(255, 179, 87, 0.3);
    }

    @keyframes ageaf-cite-fade-in {
      from { opacity: 0; transform: translateY(-2px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .ageaf-citation-indicator,
      .ageaf-citation-dup {
        animation: none;
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function resolveCm6FromOverleafEvent(e: OverleafExtensionsEvent) {
  const CodeMirror = e.detail?.CodeMirror;
  if (!CodeMirror) return;

  const viewNS = CodeMirror.view || CodeMirror;
  const stateNS = CodeMirror.state || CodeMirror;

  const Decoration = viewNS.Decoration || CodeMirror.Decoration;
  const EditorView = viewNS.EditorView || CodeMirror.EditorView;
  const WidgetType = viewNS.WidgetType || CodeMirror.WidgetType;

  const StateEffect = stateNS.StateEffect || CodeMirror.StateEffect;
  const StateField = stateNS.StateField || CodeMirror.StateField;

  if (!Decoration || !EditorView || !WidgetType || !StateEffect || !StateField) return;

  cm6 = { Decoration, EditorView, WidgetType, StateEffect, StateField };
  if (!decorations) decorations = initCitationDecorations(cm6);
}

export async function updateCitationIndicators() {
  if (analysisInProgress) return;

  const view = safeGetCmView();
  if (!view) return;

  const activeTabRaw = getActiveTabName();
  const activeFileName = normalizeTabFileName(activeTabRaw);

  // If the field isn't installed, there's nothing to update yet.
  if (!isCitationFieldInstalled(view)) return;

  const bibContent = view.state.doc.toString();

  // Check if current file is a .bib file (robust: tab name OR content heuristic)
  if (!isBibFile(activeFileName, bibContent)) {
    logDebug('skip (not bib)', { activeTabRaw, activeFileName });
    return;
  }

  analysisInProgress = true;

  try {
    const cacheKey = generateCacheKey(bibContent);

    // Check cache
    let result = getCachedAnalysis(cacheKey);

    if (!result) {
      // Perform analysis
      result = await analyzeCitations(bibContent, activeFileName ?? 'active.bib');
      setCachedAnalysis(cacheKey, result);
    }

    // Ensure we're back on a .bib before dispatching decorations.
    // (File reads may have temporarily activated other tabs, which clears decorations.)
    const waitForBib = async () => {
      const start = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const current = safeGetCmView();
        if (current) {
          const normalized = normalizeTabFileName(getActiveTabName());
          const docText = current.state.doc.toString();
          if (isBibFile(normalized, docText)) return current;
        }
        if (Date.now() - start > 2500) return null;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => window.setTimeout(r, 60));
      }
    };

    const viewForDispatch = await waitForBib();
    if (!viewForDispatch) return;

    // Update decorations
    viewForDispatch.dispatch({
      effects: decorations!.updateCitationDecorations.of({
        entries: result.entries,
        usageMap: result.usageMap,
        duplicateTitleMap: result.duplicateTitleMap,
      }),
    });

    logDebug('updated', {
      activeTabRaw,
      activeFileName,
      entries: result.entries.length,
      used: Array.from(result.usageMap.values()).filter((u) => u.isUsed).length,
    });
  } catch (err) {
    console.error('Citation analysis failed:', err);
  } finally {
    analysisInProgress = false;
  }
}

// Auto-update on file switch
export function registerCitationIndicator() {
  ensureCitationStyles();
  if (!installedViews) installedViews = new WeakSet<any>();

  // If inline diff already resolved CM6 before we registered, adopt it immediately.
  tryAdoptGlobalCm6();

  // Overleaf emits CM6 classes via this event; we must use those exports,
  // not our own @codemirror/* package instances.
  window.addEventListener('UNSTABLE_editor:extensions', (ev) => {
    try {
      resolveCm6FromOverleafEvent(ev as OverleafExtensionsEvent);
    } catch {
      // ignore
    }
  });

  // Fallback: Ageaf overlay will broadcast resolved CM6 exports.
  window.addEventListener('ageaf:cm6:resolved', () => {
    tryAdoptGlobalCm6();
  });

  // Warm the .tex citation cache shortly after page load so opening a .bib feels instant.
  window.setTimeout(() => {
    void warmTexCitationCache();
  }, 1500);

  // We intentionally do not rely on a custom "editor ready" event (none is emitted).
  // Instead we poll for a CM6 view and inject once per view, like inlineDiffOverlay does.
  window.setInterval(() => {
    const view = safeGetCmView();
    if (!view) return;
    if (!decorations || !cm6) return;

    // Ensure extension is installed (Overleaf can replace editor state on file switch,
    // which may drop our field even if the underlying view object is stable).
    if (!isCitationFieldInstalled(view)) {
      const now = Date.now();
      if (now - lastInstallAttemptAt > 500) {
        lastInstallAttemptAt = now;
        try {
          const append = cm6.StateEffect?.appendConfig;
          if (append?.of) {
            view.dispatch({ effects: append.of(decorations.citationExtension) });
            logDebug('appendConfig dispatched');
            // After injecting the field, immediately attempt an update (field may now exist).
            window.setTimeout(() => void updateCitationIndicators(), 100);
          }
        } catch {
          // ignore
        }
      }
    }

    if (isCitationFieldInstalled(view)) installedViews!.add(view);

    // While we're scanning citations, Overleaf tab changes are expected (we read .tex files).
    // Don't treat those as "user switched away", and don't run competing updates.
    if (analysisInProgress) return;

    const activeFile = getActiveTabName();
    const docText = view.state.doc.toString();
    const isBibActive = isBibFile(normalizeTabFileName(activeFile), docText);

    // If we switched away from a bib, assume decorations were cleared; force refresh when we come back.
    if (isBibActive !== lastBibActive) {
      lastBibActive = isBibActive;
      lastBibHash = null;
      if (isBibActive) {
        window.setTimeout(() => void updateCitationIndicators(), 250);
      }
    }

    // Trigger analysis when switching into a .bib tab
    if (activeFile !== lastActiveFile) {
      lastActiveFile = activeFile;
      lastBibHash = null;
      if (isBibActive) {
        // Small delay to let Overleaf update the CM6 doc
        window.setTimeout(() => void updateCitationIndicators(), 250);
      }
    }

    // While a .bib is active, refresh only when the doc changes (debounced).
    if (isBibActive) {
      const hash = `${docText.length}:${docText.slice(0, 64)}:${docText.slice(-64)}`;
      if (hash !== lastBibHash) {
        lastBibHash = hash;
        const now = Date.now();
        if (now - lastBibUpdateAt > 800) {
          lastBibUpdateAt = now;
          window.setTimeout(() => void updateCitationIndicators(), 400);
        }
      }
    }
  }, 500);
}

function getActiveTabName(): string | null {
  const selectors = [
    '.cm-tab.is-active, .cm-tab[aria-selected="true"]',
    '.cm-tab--active',
    '[role="treeitem"][aria-selected="true"]',
    '[role="tab"][aria-selected="true"]',
  ];

  for (const selector of selectors) {
    const selected = document.querySelector(selector);
    if (!(selected instanceof HTMLElement)) continue;
    const label = (
      selected.getAttribute('aria-label') ??
      selected.getAttribute('title') ??
      selected.textContent ??
      ''
    ).trim();
    const extracted = extractFilenameFromLabel(label);
    if (extracted) return extracted;
  }

  return null;
}

function extractFilenameFromLabel(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  value = value.replace(/\*+$/, '').trim(); // unsaved marker
  value = value.replace(/\s*\(.*?\)\s*$/, '').trim(); // trailing "(...)" metadata
  if (!value) return null;

  const matches = value.match(/[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,10}/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1] ?? null;
}

function normalizeTabFileName(tabLabel: string | null): string | null {
  if (!tabLabel) return null;
  let s = tabLabel.trim();
  // Common Overleaf indicators
  s = s.replace(/\*+$/, '').trim(); // unsaved marker
  s = s.replace(/\s*\(.*?\)\s*$/, '').trim(); // trailing "(...)" metadata
  // If it's a path, keep only the basename
  if (s.includes('/')) s = s.split('/').filter(Boolean).pop() ?? s;
  return s || null;
}
