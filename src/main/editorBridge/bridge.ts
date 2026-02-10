import { getContentAfterCursor, getContentBeforeCursor, getCmView } from '../helpers';
import { applyReplacementAtRange, onReplaceContent } from '../eventHandlers';
import { MAX_LENGTH_AFTER_CURSOR, MAX_LENGTH_BEFORE_CURSOR } from '../../constants';

const REQUEST_EVENT = 'ageaf:editor:request';
const RESPONSE_EVENT = 'ageaf:editor:response';
const REPLACE_EVENT = 'ageaf:editor:replace';
const INSERT_EVENT = 'ageaf:editor:insert';
const APPLY_REQUEST_EVENT = 'ageaf:editor:apply:request';
const APPLY_RESPONSE_EVENT = 'ageaf:editor:apply:response';
const FILE_REQUEST_EVENT = 'ageaf:editor:file-content:request';
const FILE_RESPONSE_EVENT = 'ageaf:editor:file-content:response';
const FILE_NAVIGATE_REQUEST_EVENT = 'ageaf:editor:file-navigate:request';
const FILE_NAVIGATE_RESPONSE_EVENT = 'ageaf:editor:file-navigate:response';

interface SelectionRequest {
  requestId: string;
}

interface SelectionResponse {
  requestId: string;
  activeName: string | null;
  selection: string;
  before: string;
  after: string;
  from: number;
  to: number;
  head: number;
  lineFrom: number;
  lineTo: number;
}

interface ApplyPatchRequest {
  text: string;
}

interface ApplyReplaceRangeRequest {
  requestId: string;
  kind: 'replaceRange';
  from: number;
  to: number;
  expectedOldText: string;
  text: string;
}

interface ApplyReplaceInFileRequest {
  requestId: string;
  kind: 'replaceInFile';
  filePath: string;
  expectedOldText: string;
  text: string;
  from?: number;
  to?: number;
}

type ApplyRequest = ApplyReplaceRangeRequest | ApplyReplaceInFileRequest;

interface ApplyResponse {
  requestId: string;
  ok: boolean;
  error?: string;
}

interface FileContentRequest {
  requestId: string;
  name: string;
  /**
   * Optional tab/file label to restore after reading content.
   * Useful for background reads that temporarily activate another file.
   */
  returnTo?: string | null;
}

interface FileContentResponse {
  requestId: string;
  name: string;
  content: string;
  activeName: string | null;
  ok: boolean;
  error?: string;
}

interface FileNavigateRequest {
  requestId: string;
  name: string;
}

interface FileNavigateResponse {
  requestId: string;
  ok: boolean;
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

function normalizeFileName(filePath: string): string {
  const trimmed = filePath.trim();
  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : trimmed;
}

function matchesActiveFile(activeName: string | null, filePath: string): boolean {
  if (!activeName) return false;
  const active = activeName.trim().toLowerCase();
  const target = filePath.trim().toLowerCase();
  const base = normalizeFileName(target).toLowerCase();
  return active === target || active === base;
}

function findClickableByName(name: string): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll(
      [
        '[role="tab"]',
        '[role="treeitem"]',
        '[data-testid="file-name"]',
        '.file-tree-item-name',
        '.file-name',
        '.entity-name',
        '.file-label',
        '.cm-tab',
        '.cm-tab-label',
      ].join(', ')
    )
  );
  const targetLower = name.trim().toLowerCase();
  for (const node of candidates) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest('#ageaf-panel-root')) continue;
    const text = (node.getAttribute('aria-label') ?? node.getAttribute('title') ?? node.textContent ?? '')
      .trim()
      .toLowerCase();
    if (!text) continue;
    if (text === targetLower || text.endsWith(targetLower) || text.includes(targetLower)) {
      return node;
    }
  }
  return null;
}

function restoreActiveFile(desiredName: string | null, activeName: string | null) {
  // Best-effort restore previous active file (avoid disrupting the user).
  try {
    const desired = desiredName?.trim();
    if (!desired) return;
    if (activeName && desired === activeName) return;

    // Try restoring by full label/path first, then by basename.
    const restore = findClickableByName(desired);
    if (restore) {
      restore.click();
      return;
    }
    const parts = desired.split('/').filter(Boolean);
    if (parts.length > 1) {
      const base = parts[parts.length - 1]!;
      const restoreBase = findClickableByName(base);
      restoreBase?.click();
    }
  } catch {
    // ignore restore errors
  }
}

async function tryActivateFileByName(name: string): Promise<boolean> {
  const el = findClickableByName(name);
  if (!el) return false;
  el.click();
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDocChange(previousHash: string, timeoutMs = 2000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const view = getCmView();
    const next = view.state.sliceDoc(0, view.state.doc.length);
    const hash = `${next.length}:${next.slice(0, 64)}:${next.slice(-64)}`;
    if (hash !== previousHash) return;
    if (Date.now() - start > timeoutMs) return;
    // eslint-disable-next-line no-await-in-loop
    await sleep(60);
  }
}

async function onFileContentRequest(event: Event) {
  const detail = (event as CustomEvent<FileContentRequest>).detail;
  if (!detail?.requestId || !detail?.name) return;

  const requested = String(detail.name).trim();
  const view = getCmView();
  const beforeText = view.state.sliceDoc(0, view.state.doc.length);
  const beforeHash = `${beforeText.length}:${beforeText.slice(0, 64)}:${beforeText.slice(-64)}`;
  const originalName = getActiveTabName();
  const returnTo = (detail.returnTo ?? originalName) ?? null;

  let ok = true;
  let error: string | undefined;

  try {
    if (requested && (!originalName || originalName.trim() !== requested)) {
      const activated = await tryActivateFileByName(requested);
      if (!activated) {
        ok = false;
        error = `Unable to activate requested file: ${requested}`;
      } else {
        await waitForDocChange(beforeHash, 2500);
      }
    }
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
  }

  const activeName = getActiveTabName();
  const content = view.state.sliceDoc(0, view.state.doc.length);

  // If we didn't end up on the requested file, do not claim success.
  if (ok && requested && !matchesActiveFile(activeName, requested)) {
    ok = false;
    error = `Requested file not active (requested: ${requested}, active: ${activeName ?? 'unknown'})`;
  }

  restoreActiveFile(returnTo, activeName);

  const response: FileContentResponse = {
    requestId: detail.requestId,
    name: requested,
    content,
    activeName,
    ok,
    ...(error ? { error } : {}),
  };

  window.dispatchEvent(new CustomEvent(FILE_RESPONSE_EVENT, { detail: response }));
}

function onSelectionRequest(event: Event) {
  const detail = (event as CustomEvent<SelectionRequest>).detail;
  if (!detail?.requestId) return;

  const view = getCmView();
  const state = view.state;
  const { from, to, head } = state.selection.main;
  const activeName = getActiveTabName();

  const inclusiveEnd = to > from ? Math.max(from, to - 1) : to;
  const response: SelectionResponse = {
    requestId: detail.requestId,
    activeName,
    selection: state.sliceDoc(from, to),
    before: getContentBeforeCursor(state, from, MAX_LENGTH_BEFORE_CURSOR),
    after: getContentAfterCursor(state, to, MAX_LENGTH_AFTER_CURSOR),
    from,
    to,
    head,
    lineFrom: state.doc.lineAt(from).number,
    lineTo: state.doc.lineAt(inclusiveEnd).number,
  };

  window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: response }));
}

async function onApplyRequest(event: Event) {
  const detail = (event as CustomEvent<ApplyRequest>).detail;
  let view = getCmView();
  let ok = true;
  let error: string | undefined;

  if (!detail?.requestId) return;

  const withProtectedEditBypass = (fn: () => void) => {
    const key = '__ageafAllowProtectedEdits';
    const prev = (window as any)[key];
    (window as any)[key] = true;
    try {
      fn();
    } finally {
      (window as any)[key] = prev;
    }
  };

  const findClosestOccurrence = (fullText: string, needle: string, hintFrom: number) => {
    if (!needle) return null;
    const windowSize = 8000;
    const start = Math.max(0, hintFrom - Math.floor(windowSize / 2));
    const end = Math.min(fullText.length, hintFrom + Math.floor(windowSize / 2));
    const chunk = fullText.slice(start, end);
    const hits: number[] = [];
    let idx = chunk.indexOf(needle);
    while (idx !== -1) {
      hits.push(start + idx);
      idx = chunk.indexOf(needle, idx + Math.max(1, needle.length));
      if (hits.length > 10) break;
    }
    if (hits.length === 0) return null;
    // Choose the closest hit to the original from position.
    let best = hits[0];
    let bestDist = Math.abs(best - hintFrom);
    for (const pos of hits.slice(1)) {
      const dist = Math.abs(pos - hintFrom);
      if (dist < bestDist) {
        best = pos;
        bestDist = dist;
      }
    }
    // Only accept if reasonably close (prevents wrong replacements when repeated text exists).
    if (bestDist > 4000) return null;
    return { from: best, to: best + needle.length };
  };

  if (detail.kind === 'replaceRange') {
    if (typeof detail.expectedOldText !== 'string' || typeof detail.text !== 'string') return;
    const current = view.state.sliceDoc(detail.from, detail.to);
    if (current !== detail.expectedOldText) {
      // If offsets shifted due to earlier edits (e.g., multiple hunks in same paragraph),
      // fall back to locating the expected text near the original position.
      const full = view.state.sliceDoc(0, view.state.doc.length);
      const closest = findClosestOccurrence(full, detail.expectedOldText, detail.from);
      if (!closest) {
        ok = false;
        error = 'Selection changed';
      } else {
        const verify = view.state.sliceDoc(closest.from, closest.to);
        if (verify !== detail.expectedOldText) {
          ok = false;
          error = 'Selection changed';
        } else {
          withProtectedEditBypass(() => {
            applyReplacementAtRange(view, closest.from, closest.to, detail.text);
          });
        }
      }
    } else {
      withProtectedEditBypass(() => {
        applyReplacementAtRange(view, detail.from, detail.to, detail.text);
      });
    }
  } else if (detail.kind === 'replaceInFile') {
    if (
      typeof detail.filePath !== 'string' ||
      typeof detail.expectedOldText !== 'string' ||
      typeof detail.text !== 'string'
    ) {
      return;
    }

    const originalName = getActiveTabName();

    const activateTargetFile = async () => {
      const beforeText = view.state.sliceDoc(0, view.state.doc.length);
      const beforeHash = `${beforeText.length}:${beforeText.slice(0, 64)}:${beforeText.slice(-64)}`;
      const candidates = Array.from(
        new Set([detail.filePath.trim(), normalizeFileName(detail.filePath)])
      ).filter(Boolean);

      for (const candidate of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const activated = await tryActivateFileByName(candidate);
        if (activated) {
          // eslint-disable-next-line no-await-in-loop
          await waitForDocChange(beforeHash, 2500);
          view = getCmView();
          break;
        }
      }
    };

    const resolveReplacementRange = () => {
      const rangeFrom =
        typeof detail.from === 'number' && Number.isFinite(detail.from) ? detail.from : null;
      const rangeTo =
        typeof detail.to === 'number' && Number.isFinite(detail.to) ? detail.to : null;

      // Try explicit from/to with content verification
      if (typeof rangeFrom === 'number' && typeof rangeTo === 'number' && rangeTo >= rangeFrom) {
        const current = view.state.sliceDoc(rangeFrom, rangeTo);
        if (current === detail.expectedOldText) {
          return { ok: true as const, from: rangeFrom, to: rangeTo };
        }
        // Offsets don't match content — fall through to indexOf search
      }

      const full = view.state.sliceDoc(0, view.state.doc.length);
      const first = full.indexOf(detail.expectedOldText);
      if (first === -1) {
        return { ok: false as const, error: 'Expected text not found', retryable: true as const };
      }
      const second = full.indexOf(detail.expectedOldText, first + detail.expectedOldText.length);
      if (second !== -1) {
        return { ok: false as const, error: 'Expected text appears multiple times', retryable: false as const };
      }
      return { ok: true as const, from: first, to: first + detail.expectedOldText.length };
    };

    const hasExplicitRange =
      typeof detail.from === 'number' &&
      Number.isFinite(detail.from) &&
      typeof detail.to === 'number' &&
      Number.isFinite(detail.to) &&
      detail.to >= detail.from;

      if (!detail.expectedOldText && !hasExplicitRange) {
        ok = false;
        error = 'Expected text missing';
      } else {
        let activated = false;
        let resolved = resolveReplacementRange();

      if (!resolved.ok && resolved.retryable) {
        try {
          await activateTargetFile();
          activated = true;
          resolved = resolveReplacementRange();
        } catch (err) {
          ok = false;
          error = err instanceof Error ? err.message : String(err);
        }
      }

      if (ok && resolved.ok) {
        const current = view.state.sliceDoc(resolved.from, resolved.to);
        if (current !== detail.expectedOldText) {
          if (!activated) {
            try {
              await activateTargetFile();
              activated = true;
            } catch (err) {
              ok = false;
              error = err instanceof Error ? err.message : String(err);
            }
          }

          if (ok) {
            const refreshed = resolveReplacementRange();
            if (refreshed.ok) {
              const refreshedCurrent = view.state.sliceDoc(refreshed.from, refreshed.to);
              if (refreshedCurrent !== detail.expectedOldText) {
                ok = false;
                error = 'Selection changed';
              } else {
                withProtectedEditBypass(() => {
                  applyReplacementAtRange(view, refreshed.from, refreshed.to, detail.text);
                });
              }
            } else if (refreshed.error === 'Expected text not found') {
              ok = false;
              error = `Open ${normalizeFileName(detail.filePath)} in Overleaf and retry.`;
            } else {
              ok = false;
              error = refreshed.error;
            }
          }
        } else {
          withProtectedEditBypass(() => {
            applyReplacementAtRange(view, resolved.from as number, resolved.to as number, detail.text);
          });
        }
      } else if (ok && !resolved.ok) {
        ok = false;
        error =
          resolved.error === 'Expected text not found'
            ? `Open ${normalizeFileName(detail.filePath)} in Overleaf and retry.`
            : resolved.error;
      }
    }

    restoreActiveFile(originalName, getActiveTabName());
  }

  const response: ApplyResponse = {
    requestId: detail.requestId,
    ok,
    ...(error ? { error } : {}),
  };

  window.dispatchEvent(new CustomEvent(APPLY_RESPONSE_EVENT, { detail: response }));
}

function onReplaceSelection(event: Event) {
  const detail = (event as CustomEvent<ApplyPatchRequest>).detail;
  if (!detail?.text) return;

  const view = getCmView();
  const { from, to } = view.state.selection.main;

  onReplaceContent(
    new CustomEvent('copilot:editor:replace', {
      detail: { content: detail.text, from, to }
    })
  );
}

function onInsertAtCursor(event: Event) {
  const detail = (event as CustomEvent<ApplyPatchRequest>).detail;
  if (!detail?.text) return;

  const view = getCmView();
  const { head } = view.state.selection.main;
  const selection = { anchor: head + detail.text.length };

  view.dispatch({
    changes: { from: head, to: head, insert: detail.text },
    selection,
  });
}

async function onFileNavigateRequest(event: Event) {
  const detail = (event as CustomEvent<FileNavigateRequest>).detail;
  if (!detail?.requestId || !detail?.name) return;

  let ok = false;
  try {
    ok = await tryActivateFileByName(String(detail.name));
  } catch {
    ok = false;
  }

  const response: FileNavigateResponse = {
    requestId: detail.requestId,
    ok,
  };
  window.dispatchEvent(
    new CustomEvent(FILE_NAVIGATE_RESPONSE_EVENT, { detail: response })
  );
}

export function registerEditorBridge() {
  window.addEventListener(REQUEST_EVENT, onSelectionRequest as EventListener);
  window.addEventListener(FILE_REQUEST_EVENT, onFileContentRequest as EventListener);
  window.addEventListener(APPLY_REQUEST_EVENT, onApplyRequest as EventListener);
  window.addEventListener(REPLACE_EVENT, onReplaceSelection as EventListener);
  window.addEventListener(INSERT_EVENT, onInsertAtCursor as EventListener);
  window.addEventListener(FILE_NAVIGATE_REQUEST_EVENT, onFileNavigateRequest as EventListener);
}
