import { getCmView } from './helpers';
import { LOCAL_STORAGE_KEY_INLINE_OVERLAY } from '../constants';

const OVERLAY_SHOW_EVENT = 'ageaf:editor:overlay:show';
const OVERLAY_CLEAR_EVENT = 'ageaf:editor:overlay:clear';
const OVERLAY_READY_EVENT = 'ageaf:editor:overlay:ready';
const PANEL_ACTION_EVENT = 'ageaf:panel:patch-review-action';
const STYLE_ID = 'ageaf-inline-diff-overlay-style';

type OverlayKind = 'replaceSelection' | 'replaceRangeInFile' | 'insertAtCursor';

type OverlayPayload = {
  messageId: string;
  kind: OverlayKind;
  filePath?: string;
  fileName?: string;
  from?: number;
  to?: number;
  oldText?: string;
  newText?: string;
  projectId?: string | null;
};

type OverlayRange = {
  from: number;
  to: number;
  oldText: string;
  newText: string;
};

type Cm6Exports = {
  Decoration: any;
  EditorView: any;
  EditorState?: any;
  StateEffect: any;
  StateField: any;
  WidgetType: any;
  Compartment?: any;
};

type OverlayWidgetPayload = {
  from: number;
  replaceFrom: number;
  replaceTo: number;
  text: string;
  messageId: string;
};

let cm6Exports: Cm6Exports | null = null;
let overlayCompartment: any = null;
let overlayField: any = null;
let overlayEffect: any = null;
let overlayWidgetView: any = null;
let overlayInstalledViews: WeakSet<any> | null = null;
let lastInstallAttemptAt = 0;
let overlayGuardExtension: any = null;

let overlayRoot: HTMLDivElement | null = null;
let overlayById: Map<string, OverlayPayload> = new Map();
let overlayScrollDom: HTMLElement | null = null;
let overlayUpdateTimer: number | null = null;
let overlayScheduled = false;
let overlayScrollListenerDom: HTMLElement | null = null;
let lastLogKey: string | null = null;
let lastLogAt = 0;
let gapSpacerEl: HTMLDivElement | null = null;
let gapAnchorEl: HTMLElement | null = null;
let lastGapPx = 0;
let contentObserver: MutationObserver | null = null;
let observedContentDom: HTMLElement | null = null;
let isMutatingEditorDom = false;
let overlayResizeObserver: ResizeObserver | null = null;
let observedResizeDom: HTMLElement | null = null;

// Bottom-center review bar (per active file)
let reviewBarEl: HTMLDivElement | null = null;
let reviewBarItems: Array<{ messageId: string; from: number }> = [];
let reviewBarFileKey: string | null = null;
let reviewBarFocusedByFile: Map<string, string> = new Map();
let bulkActionInProgress = false;

function isDebugEnabled() {
  try {
    return window.localStorage.getItem('ageaf_debug_overlay') === '1';
  } catch {
    return false;
  }
}

function logOnce(key: string, ...args: any[]) {
  const now = Date.now();
  // Log on reason change, or at most once every 2s for the same reason.
  if (lastLogKey === key && now - lastLogAt < 2000) return;
  lastLogKey = key;
  lastLogAt = now;
  // eslint-disable-next-line no-console
  console.log('[Ageaf Overlay]', ...args);
}

function safeGetCmView(): ReturnType<typeof getCmView> | null {
  try {
    return getCmView();
  } catch {
    return null;
  }
}

function getProjectIdFromPathname(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'project') return null;
  return segments[1] || null;
}

function getCurrentProjectId() {
  return getProjectIdFromPathname(window.location.pathname);
}

function ensureInlineDiffStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ageaf-inline-diff-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 20;
    }

    .ageaf-inline-diff-old {
      position: absolute;
      background: rgba(239, 68, 68, 0.16);
      border-radius: 3px;
    }

    .ageaf-inline-diff-new {
      position: absolute;
      background: rgba(57, 185, 138, 0.18);
      border-radius: 4px;
      padding: 2px 6px;
      /* Show readable proposal blocks; allow wrapping inside the viewport width. */
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      box-sizing: border-box;
      pointer-events: none;
    }

    .ageaf-inline-diff-actions {
      position: absolute;
      display: inline-flex;
      gap: 6px;
      pointer-events: auto;
      z-index: 30;
    }

    .ageaf-inline-diff-btn {
      all: unset;
      cursor: pointer;
      font-family: 'Work Sans', -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 600;
      padding: 5px 10px;
      min-height: 28px;
      border-radius: 6px;
      background: rgba(57, 185, 138, 0.2);
      color: #0a2318;
      border: 1px solid rgba(57, 185, 138, 0.4);
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      box-sizing: border-box;
    }

    .ageaf-inline-diff-btn:hover {
      background: rgba(57, 185, 138, 0.3);
      border-color: rgba(57, 185, 138, 0.6);
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(57, 185, 138, 0.2);
    }

    .ageaf-inline-diff-btn:active {
      transform: translateY(0);
    }

    .ageaf-inline-diff-btn:focus-visible {
      outline: 2px solid #39b98a;
      outline-offset: 2px;
    }

    .ageaf-inline-diff-btn.is-reject {
      background: rgba(255, 107, 107, 0.2);
      color: #3d0a0a;
      border: 1px solid rgba(255, 107, 107, 0.4);
    }

    .ageaf-inline-diff-btn.is-reject:hover {
      background: rgba(255, 107, 107, 0.3);
      border-color: rgba(255, 107, 107, 0.6);
    }

    .ageaf-inline-diff-btn.is-feedback {
      background: rgba(77, 184, 232, 0.16);
      color: #0a1e2d;
      border: 1px solid rgba(77, 184, 232, 0.35);
    }

    .ageaf-inline-diff-btn.is-feedback:hover {
      background: rgba(77, 184, 232, 0.25);
      border-color: rgba(77, 184, 232, 0.5);
    }

    .ageaf-inline-diff-addition {
      position: relative;
      display: block;
      width: auto;
      margin: 6px 0 0 0;
      background: transparent;
      border: none;
      border-radius: 0;
      pointer-events: auto;
      box-sizing: border-box;
    }

    .ageaf-inline-diff-addition__text {
      padding: 6px 8px 48px 8px; /* bottom space for buttons, overridden inline */
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      background: rgba(57, 185, 138, 0.12);
      border-radius: 0;
      width: 100%;
      box-sizing: border-box;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      color: inherit;
    }

    .ageaf-inline-diff-addition__actions {
      position: absolute;
      right: 10px;
      bottom: 10px;
      display: inline-flex;
      gap: 8px;
      flex: 0 0 auto;
    }

    .ageaf-inline-diff-widget {
      display: block;
      width: 100%;
      margin: 6px 0;
      background: transparent;
      border: none;
      border-radius: 0;
      pointer-events: auto;
      box-sizing: border-box;
      position: relative;
    }

    .ageaf-inline-diff-widget__text {
      padding: 6px 8px 48px 8px;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      background: rgba(57, 185, 138, 0.12);
      border-radius: 0;
      width: 100%;
      box-sizing: border-box;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      color: inherit;
    }

    /* Make the proposed text editable with visual affordance */
    textarea.ageaf-inline-diff-widget__text {
      border: 1px dashed rgba(57, 185, 138, 0.25);
      border-radius: 4px;
      outline: none;
      resize: none;
      min-height: 64px;
      display: block;
      overflow: hidden; /* auto-sized via JS; avoid internal scrolling */
      height: auto;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    textarea.ageaf-inline-diff-widget__text:hover {
      border-color: rgba(57, 185, 138, 0.4);
    }

    textarea.ageaf-inline-diff-widget__text:focus {
      border-style: solid;
      border-color: rgba(57, 185, 138, 0.6);
      box-shadow: 0 0 0 2px rgba(57, 185, 138, 0.15);
    }

    .ageaf-inline-diff-widget__actions {
      position: absolute;
      right: 10px;
      bottom: 10px;
      display: inline-flex;
      gap: 8px;
      flex: 0 0 auto;
    }

    /* CM6 mark decoration for the red "old" area (exact range) */
    .ageaf-inline-diff-old-mark {
      background: rgba(239, 68, 68, 0.14);
    }

    .ageaf-review-bar {
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(15, 20, 17, 0.94);
      border: 1px solid rgba(57, 185, 138, 0.18);
      color: #f7fbf9;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(57, 185, 138, 0.08);
      font-family: 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      pointer-events: auto;
      user-select: none;
      animation: ageaf-review-bar-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .ageaf-review-bar__count {
      white-space: nowrap;
      opacity: 0.95;
    }

    .ageaf-review-bar__nav {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .ageaf-review-bar__btn {
      all: unset;
      cursor: pointer;
      padding: 8px 12px;
      min-width: 32px;
      min-height: 32px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(255, 255, 255, 0.08);
      color: #f7fbf9;
      font-weight: 600;
      line-height: 1;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .ageaf-review-bar__btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    .ageaf-review-bar__btn:active {
      transform: translateY(1px);
    }

    .ageaf-review-bar__btn:focus-visible {
      outline: 2px solid #39b98a;
      outline-offset: 2px;
    }

    .ageaf-review-bar__btn.is-primary {
      background: rgba(57, 185, 138, 0.22);
      border-color: rgba(57, 185, 138, 0.45);
      color: #f7fbf9;
    }

    .ageaf-review-bar__btn.is-primary:hover {
      background: rgba(57, 185, 138, 0.32);
    }

    .ageaf-review-bar__btn.is-danger {
      background: rgba(255, 107, 107, 0.22);
      border-color: rgba(255, 107, 107, 0.45);
      color: #f7fbf9;
    }

    .ageaf-review-bar__btn.is-danger:hover {
      background: rgba(255, 107, 107, 0.32);
    }

    @keyframes ageaf-review-bar-enter {
      from { opacity: 0; transform: translateX(-50%) translateY(12px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .ageaf-review-bar,
      .ageaf-inline-diff-btn {
        animation: none !important;
        transition: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureReviewBar() {
  if (reviewBarEl) return reviewBarEl;
  const bar = document.createElement('div');
  bar.className = 'ageaf-review-bar';
  bar.style.display = 'none';

  const count = document.createElement('div');
  count.className = 'ageaf-review-bar__count';
  count.textContent = '0 of 0 review change hunks';

  const nav = document.createElement('div');
  nav.className = 'ageaf-review-bar__nav';

  const prev = document.createElement('button');
  prev.className = 'ageaf-review-bar__btn';
  prev.textContent = '<';
  prev.title = 'Previous hunk';
  prev.setAttribute('aria-label', 'Previous review hunk');

  const next = document.createElement('button');
  next.className = 'ageaf-review-bar__btn';
  next.textContent = '>';
  next.title = 'Next hunk';
  next.setAttribute('aria-label', 'Next review hunk');

  nav.appendChild(prev);
  nav.appendChild(next);

  const undoAll = document.createElement('button');
  undoAll.className = 'ageaf-review-bar__btn is-danger';
  undoAll.textContent = 'Undo All';
  undoAll.title = 'Reject all hunks in this file';
  undoAll.setAttribute('aria-label', 'Reject all review hunks');

  const acceptAll = document.createElement('button');
  acceptAll.className = 'ageaf-review-bar__btn is-primary';
  acceptAll.textContent = 'Accept All';
  acceptAll.title = 'Accept all hunks in this file';
  acceptAll.setAttribute('aria-label', 'Accept all review hunks');

  bar.appendChild(count);
  bar.appendChild(nav);
  bar.appendChild(undoAll);
  bar.appendChild(acceptAll);
  document.body.appendChild(bar);
  reviewBarEl = bar;

  const updateCount = (text: string) => {
    count.textContent = text;
  };

  const focusIndexForFile = () => {
    if (!reviewBarFileKey || reviewBarItems.length === 0) return 0;
    const focused = reviewBarFocusedByFile.get(reviewBarFileKey);
    const idx = focused
      ? reviewBarItems.findIndex((x) => x.messageId === focused)
      : -1;
    return idx >= 0 ? idx : 0;
  };

  const scrollToFocused = (view: any) => {
    if (!reviewBarFileKey || reviewBarItems.length === 0) return;
    const idx = focusIndexForFile();
    const item = reviewBarItems[idx];
    if (!item) return;
    try {
      const coords = view.coordsAtPos(item.from);
      if (!coords) return;
      const scrollDOM = view.scrollDOM as HTMLElement;
      const hostRect = scrollDOM.getBoundingClientRect();
      const targetTop =
        coords.top -
        hostRect.top +
        scrollDOM.scrollTop -
        scrollDOM.clientHeight * 0.35;
      scrollDOM.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    } catch {
      // ignore
    }
  };

  const setFocusByDelta = (delta: number) => {
    const view = safeGetCmView();
    if (!view || !reviewBarFileKey || reviewBarItems.length === 0) return;
    const cur = focusIndexForFile();
    const nextIdx =
      (cur + delta + reviewBarItems.length) % reviewBarItems.length;
    const nextItem = reviewBarItems[nextIdx];
    if (!nextItem) return;
    reviewBarFocusedByFile.set(reviewBarFileKey, nextItem.messageId);
    updateCount(
      `${nextIdx + 1} of ${reviewBarItems.length} review change hunks`
    );
    scrollToFocused(view);
  };

  const dispatchPanelAction = (
    messageId: string,
    action: 'accept' | 'reject'
  ) => {
    const detail: any = { messageId, action };
    if (action === 'accept') {
      const esc =
        typeof (CSS as any)?.escape === 'function'
          ? (CSS as any).escape(messageId)
          : messageId;
      const editor = document.querySelector(
        `.ageaf-inline-diff-widget[data-message-id="${esc}"] textarea[data-ageaf-proposed-editor="1"]`
      ) as HTMLTextAreaElement | null;
      if (editor) detail.text = editor.value;
    }
    window.dispatchEvent(new CustomEvent(PANEL_ACTION_EVENT, { detail }));
  };

  const waitForOverlayGone = async (messageId: string, timeoutMs = 8000) => {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!overlayById.has(String(messageId))) return true;
      if (Date.now() - start > timeoutMs) return false;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 120));
    }
  };

  const runBulk = async (action: 'accept' | 'reject') => {
    if (bulkActionInProgress) return;
    const view = safeGetCmView();
    if (!view || !reviewBarFileKey || reviewBarItems.length === 0) return;
    bulkActionInProgress = true;
    try {
      const ids = [...new Set(
        [...reviewBarItems]
          .sort((a, b) => a.from - b.from)
          .map((x) => x.messageId)
      )];
      for (const id of ids) {
        if (!overlayById.has(String(id))) continue;
        dispatchPanelAction(id, action);
        // eslint-disable-next-line no-await-in-loop
        await waitForOverlayGone(id, 10000);
      }
    } finally {
      bulkActionInProgress = false;
    }
  };

  prev.onclick = (e) => {
    e.preventDefault();
    setFocusByDelta(-1);
  };
  next.onclick = (e) => {
    e.preventDefault();
    setFocusByDelta(1);
  };
  undoAll.onclick = (e) => {
    e.preventDefault();
    void runBulk('reject');
  };
  acceptAll.onclick = (e) => {
    e.preventDefault();
    void runBulk('accept');
  };

  (bar as any).__ageafUpdateCount = updateCount;
  return bar;
}

function updateReviewBar(
  fileKey: string,
  items: Array<{ messageId: string; from: number }>
) {
  const bar = ensureReviewBar();
  reviewBarFileKey = fileKey;
  reviewBarItems = items;

  if (!fileKey || items.length === 0) {
    bar.style.display = 'none';
    return;
  }

  const focused = reviewBarFocusedByFile.get(fileKey);
  if (!focused || !items.some((x) => x.messageId === focused)) {
    reviewBarFocusedByFile.set(fileKey, items[0]!.messageId);
  }

  const focusId = reviewBarFocusedByFile.get(fileKey)!;
  const idx = Math.max(
    0,
    items.findIndex((x) => x.messageId === focusId)
  );
  (bar as any).__ageafUpdateCount?.(
    `${idx + 1} of ${items.length} review change hunks`
  );
  bar.style.display = 'flex';
}

function hideReviewBar() {
  if (reviewBarEl) reviewBarEl.style.display = 'none';
  reviewBarItems = [];
  reviewBarFileKey = null;
  bulkActionInProgress = false;
}

function normalizeFileName(filePath: string): string {
  const trimmed = filePath.trim();
  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : trimmed;
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

function matchesActiveFile(
  activeName: string | null,
  filePath: string
): boolean {
  // If we can't detect the active tab name (Overleaf DOM not ready / changed),
  // do NOT block rendering—range resolution will fail safely if it's the wrong file.
  if (!activeName) return true;
  const active = activeName.trim().toLowerCase();
  const target = filePath.trim().toLowerCase();
  const base = normalizeFileName(target).toLowerCase();
  return active === target || active === base;
}

function findUniqueRange(fullText: string, needle: string): { from: number; to: number } | null {
  if (!needle) return null;
  const first = fullText.indexOf(needle);
  if (first === -1) return null;
  const second = fullText.indexOf(needle, first + needle.length);
  if (second !== -1) return null;
  return { from: first, to: first + needle.length };
}

function findFirstOccurrence(fullText: string, needle: string): { from: number; to: number } | null {
  if (!needle) return null;
  const idx = fullText.indexOf(needle);
  if (idx === -1) return null;
  return { from: idx, to: idx + needle.length };
}

function findTrimmedRange(fullText: string, needle: string): { from: number; to: number } | null {
  const trimmed = needle.trim();
  if (!trimmed || trimmed === needle) return null;
  return findUniqueRange(fullText, trimmed);
}

function findNormalizedRange(fullText: string, needle: string): { from: number; to: number } | null {
  const normalize = (s: string) => s.replace(/[^\S\n]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  const normNeedle = normalize(needle);
  const normFull = normalize(fullText);
  if (!normNeedle) return null;
  const idx = normFull.indexOf(normNeedle);
  if (idx === -1) return null;
  // Map back to original coordinates: walk both strings in parallel
  let origIdx = 0;
  let normIdx = 0;
  while (normIdx < idx && origIdx < fullText.length) {
    const nc = normalize(fullText.slice(0, origIdx + 1));
    if (nc.length > normIdx) normIdx = nc.length;
    origIdx++;
  }
  // Approximate: use the original text length for the span
  const from = origIdx;
  const approxLen = needle.trim().length;
  const to = Math.min(fullText.length, from + approxLen);
  return { from, to };
}

function resolveOverlayRange(
  view: ReturnType<typeof getCmView>,
  payload: OverlayPayload
): OverlayRange | null {
  const state = view.state;
  const fullText = state.sliceDoc(0, state.doc.length);
  const oldText = payload.oldText ?? '';
  const newText = payload.newText ?? '';

  if (payload.kind === 'insertAtCursor') {
    const head = state.selection.main.head;
    return { from: head, to: head, oldText: '', newText };
  }

  // Strategy A: Exact from/to + content match
  if (
    typeof payload.from === 'number' &&
    typeof payload.to === 'number' &&
    payload.to >= payload.from
  ) {
    const current = state.sliceDoc(payload.from, payload.to);
    if (!oldText || current === oldText) {
      return { from: payload.from, to: payload.to, oldText: current, newText };
    }
  }

  // Strategy B: Unique text search (exact indexOf, must be unique)
  if (oldText) {
    const resolved = findUniqueRange(fullText, oldText);
    if (resolved) {
      return { ...resolved, oldText, newText };
    }
  }

  // Strategy C: First occurrence (drop uniqueness constraint)
  if (oldText) {
    const resolved = findFirstOccurrence(fullText, oldText);
    if (resolved) {
      return { ...resolved, oldText, newText };
    }
  }

  // Strategy D: Trimmed text search
  if (oldText) {
    const resolved = findTrimmedRange(fullText, oldText);
    if (resolved) {
      const trimmed = oldText.trim();
      return { ...resolved, oldText: trimmed, newText };
    }
  }

  // Strategy E: Normalized whitespace search
  if (oldText && oldText.length > 20) {
    const resolved = findNormalizedRange(fullText, oldText);
    if (resolved) {
      const current = state.sliceDoc(resolved.from, resolved.to);
      return { from: resolved.from, to: resolved.to, oldText: current, newText };
    }
  }

  if (isDebugEnabled()) {
    logOnce(
      'resolve-fail-' + (payload.messageId ?? ''),
      'resolveOverlayRange: all strategies failed',
      {
        messageId: payload.messageId,
        kind: payload.kind,
        oldTextLen: oldText.length,
        oldTextPreview: oldText.slice(0, 200),
        hasFromTo: typeof payload.from === 'number' && typeof payload.to === 'number',
      }
    );
  }

  return null;
}

function ensureOverlayRoot(view: ReturnType<typeof getCmView>) {
  const scrollDOM = view.scrollDOM as HTMLElement;
  if (overlayRoot && overlayScrollDom === scrollDOM) return;
  overlayRoot?.remove();
  overlayRoot = document.createElement('div');
  overlayRoot.className = 'ageaf-inline-diff-overlay';
  overlayScrollDom = scrollDOM;
  const computed = window.getComputedStyle(scrollDOM);
  if (computed.position === 'static') {
    scrollDOM.style.position = 'relative';
  }
  scrollDOM.appendChild(overlayRoot);
}

function clearOverlayElements() {
  if (!overlayRoot) return;
  overlayRoot.innerHTML = '';
}

function clearGap() {
  if (gapSpacerEl) {
    gapSpacerEl.remove();
    gapSpacerEl = null;
  }
  gapAnchorEl = null;
  lastGapPx = 0;
}

function ensureGapSpacerAfter(targetEl: HTMLElement) {
  if (!gapSpacerEl) {
    gapSpacerEl = document.createElement('div');
    gapSpacerEl.setAttribute('data-ageaf-overlay-gap', '1');
    gapSpacerEl.style.display = 'block';
    gapSpacerEl.style.width = '100%';
    gapSpacerEl.style.height = '0px';
    gapSpacerEl.style.pointerEvents = 'none';
  }
  if (
    gapAnchorEl !== targetEl ||
    gapSpacerEl.parentElement !== targetEl.parentElement
  ) {
    gapSpacerEl.remove();
    targetEl.after(gapSpacerEl);
    gapAnchorEl = targetEl;
  }
}

function findLineAtY(contentDOM: HTMLElement, y: number) {
  const lines = Array.from(
    contentDOM.querySelectorAll<HTMLElement>('.cm-line')
  );
  for (const lineEl of lines) {
    const rect = lineEl.getBoundingClientRect();
    if (y >= rect.top && y <= rect.bottom) return lineEl;
  }
  return null;
}

function ensureContentObserver(contentDOM: HTMLElement) {
  if (observedContentDom === contentDOM && contentObserver) return;
  try {
    contentObserver?.disconnect();
  } catch {
    // ignore
  }
  observedContentDom = contentDOM;
  contentObserver = new MutationObserver(() => {
    // Avoid feedback loops when we mutate CodeMirror DOM ourselves.
    if (isMutatingEditorDom) return;
    scheduleOverlayUpdate();
  });
  contentObserver.observe(contentDOM, {
    childList: true,
    subtree: true,
    characterData: false,
    attributes: false,
  });
}

function ensureResizeObserver(target: HTMLElement) {
  if (observedResizeDom === target && overlayResizeObserver) return;
  try {
    overlayResizeObserver?.disconnect();
  } catch {
    // ignore
  }
  observedResizeDom = target;
  overlayResizeObserver = new ResizeObserver(() => {
    scheduleOverlayUpdate();
  });
  overlayResizeObserver.observe(target);
}

function stopResizeObserver() {
  try {
    overlayResizeObserver?.disconnect();
  } catch {
    // ignore
  }
  overlayResizeObserver = null;
  observedResizeDom = null;
}

function stopContentObserver() {
  try {
    contentObserver?.disconnect();
  } catch {
    // ignore
  }
  contentObserver = null;
  observedContentDom = null;
}

function toRelativeCoords(scrollDOM: HTMLElement, rect: DOMRect) {
  const hostRect = scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - hostRect.left + scrollDOM.scrollLeft,
    right: rect.right - hostRect.left + scrollDOM.scrollLeft,
    top: rect.top - hostRect.top + scrollDOM.scrollTop,
    bottom: rect.bottom - hostRect.top + scrollDOM.scrollTop,
  };
}

function toRelativePoint(
  scrollDOM: HTMLElement,
  point: { left: number; top: number }
) {
  const hostRect = scrollDOM.getBoundingClientRect();
  return {
    left: point.left - hostRect.left + scrollDOM.scrollLeft,
    top: point.top - hostRect.top + scrollDOM.scrollTop,
  };
}

function scheduleOverlayUpdate() {
  if (overlayScheduled) return;
  overlayScheduled = true;
  window.requestAnimationFrame(() => {
    overlayScheduled = false;
    renderOverlay();
  });
}

function initializeCm6Overlay(cm6: Cm6Exports) {
  if (overlayField && overlayEffect && overlayCompartment) return;

  const {
    StateEffect,
    StateField,
    Decoration,
    EditorView,
    EditorState,
    Compartment,
    WidgetType,
  } = cm6;

  // Create effect type for setting overlay payload(s)
  overlayEffect = StateEffect.define();

  // Create widget class that extends WidgetType if available, otherwise use plain object
  let WidgetClass: any;
  if (WidgetType) {
    WidgetClass = class extends WidgetType {
      constructor(
        private readonly text: string,
        private readonly messageId: string
      ) {
        super();
      }

      eq(other: any) {
        return other.messageId === this.messageId && other.text === this.text;
      }

      ignoreEvent() {
        // Let DOM controls inside the widget receive pointer/click events.
        return true;
      }

      toDOM() {
        return createWidgetDOM(this.text, this.messageId);
      }
    };
  } else {
    // Fallback: plain object (shouldn't happen if CM6 is complete)
    WidgetClass = class {
      constructor(
        private readonly text: string,
        private readonly messageId: string
      ) {}

      eq(other: any) {
        return other.messageId === this.messageId && other.text === this.text;
      }

      ignoreEvent() {
        return true;
      }

      toDOM() {
        return createWidgetDOM(this.text, this.messageId);
      }
    };
  }

  // Create StateField to manage decorations + protected ranges
  overlayField = StateField.define({
    create() {
      return { deco: Decoration.none, ranges: [] as Array<[number, number]> };
    },
    update(value: any, tr: any) {
      let deco = value?.deco?.map
        ? value.deco.map(tr.changes)
        : Decoration.none;
      let ranges: Array<[number, number]> = Array.isArray(value?.ranges)
        ? value.ranges
        : [];
      try {
        ranges = ranges.map(([rf, rt]) => {
          const nextFrom = tr.changes.mapPos(rf, 1);
          const nextTo = tr.changes.mapPos(rt, -1);
          return [nextFrom, Math.max(nextFrom, nextTo)];
        });
      } catch {
        // ignore mapping
      }
      for (const e of tr.effects) {
        if (e.is(overlayEffect)) {
          if (e.value) {
            const list: OverlayWidgetPayload[] = Array.isArray(e.value)
              ? e.value
              : [e.value];
            const items: any[] = [];
            const nextRanges: Array<[number, number]> = [];

            for (const entry of list) {
              if (!entry) continue;

              // Old region highlight (red) using an exact-range mark so it matches what will be replaced,
              // even when a paragraph is a single long (wrapped) line in the editor.
              const rf = Number(entry.replaceFrom);
              const rt = Number(entry.replaceTo);
              if (Number.isFinite(rf) && Number.isFinite(rt) && rt > rf) {
                try {
                  items.push(
                    Decoration.mark({
                      class: 'ageaf-inline-diff-old-mark',
                    }).range(rf, rt)
                  );
                  nextRanges.push([rf, rt]);
                } catch {
                  // ignore
                }
              }

              // Proposed region (green) block widget inserted after selection.
              const widget = new WidgetClass(entry.text, entry.messageId);
              items.push(
                Decoration.widget({
                  widget,
                  block: true,
                  side: 1,
                }).range(entry.from)
              );
            }

            deco = Decoration.set(items, true);
            ranges = nextRanges;
          } else {
            deco = Decoration.none;
            ranges = [];
          }
        }
      }
      return { deco, ranges };
    },
    provide: (f: any) => EditorView.decorations.from(f, (v: any) => v.deco),
  });

  // Optional: transaction filter to prevent edits inside "red" (old) ranges.
  // Allow our own apply transactions by setting window.__ageafAllowProtectedEdits = true.
  overlayGuardExtension = null;
  try {
    const tf = EditorState?.transactionFilter;
    if (tf?.of) {
      overlayGuardExtension = tf.of((tr: any) => {
        if ((window as any).__ageafAllowProtectedEdits) return tr;
        if (!tr?.docChanged) return tr;
        const fieldVal = tr?.startState?.field?.(overlayField, false);
        const ranges: Array<[number, number]> = fieldVal?.ranges ?? [];
        if (!ranges || ranges.length === 0) return tr;
        let blocked = false;
        try {
          tr.changes.iterChanges((fromA: number, toA: number) => {
            for (const [rf, rt] of ranges) {
              if (toA <= rf || fromA >= rt) continue;
              blocked = true;
              return;
            }
          });
        } catch {
          // If we can't inspect changes, be permissive.
          return tr;
        }
        return blocked ? [] : tr;
      });
    }
  } catch {
    overlayGuardExtension = null;
  }

  // Create compartment for dynamic injection
  if (Compartment) {
    overlayCompartment = new Compartment();
  }

  overlayInstalledViews = new WeakSet<any>();

  logOnce('cm6-initialized', 'CM6 overlay system initialized');
}

function isCm6FieldInstalled(view: any) {
  if (!overlayField) return false;
  try {
    // field(field, false) returns undefined when not present
    return view?.state?.field?.(overlayField, false) != null;
  } catch {
    return false;
  }
}

function ensureCm6FieldInstalled(view: any) {
  if (!cm6Exports || !overlayField || !overlayEffect) return false;
  if (overlayInstalledViews?.has(view)) return true;
  if (isCm6FieldInstalled(view)) {
    overlayInstalledViews?.add(view);
    return true;
  }

  // Avoid spamming appendConfig on every animation frame.
  const now = Date.now();
  if (now - lastInstallAttemptAt < 500) return false;
  lastInstallAttemptAt = now;

  try {
    const baseExt = overlayGuardExtension
      ? [overlayField, overlayGuardExtension]
      : overlayField;
    const ext = overlayCompartment ? overlayCompartment.of(baseExt) : baseExt;
    // Preferred dynamic append
    const append = cm6Exports.StateEffect?.appendConfig;
    if (!append?.of) {
      logOnce(
        'cm6-no-appendConfig',
        'CM6 StateEffect.appendConfig missing; cannot inject field'
      );
      return false;
    }
    view.dispatch({ effects: append.of(ext) });
  } catch (err: any) {
    logOnce('cm6-inject-error', 'Failed to inject CM6 field', {
      error: err?.message,
    });
    return false;
  }

  if (isCm6FieldInstalled(view)) {
    overlayInstalledViews?.add(view);
    logOnce('cm6-field-installed', 'CM6 overlay field installed in view');
    return true;
  }

  logOnce(
    'cm6-field-not-yet',
    'CM6 overlay field not yet available after inject attempt'
  );
  return false;
}

function createWidgetDOM(text: string, messageId: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ageaf-inline-diff-widget';
  wrap.setAttribute('data-message-id', messageId);

  const textEl = document.createElement('textarea');
  textEl.className = 'ageaf-inline-diff-widget__text';
  (textEl as HTMLTextAreaElement).value = text;
  textEl.spellcheck = false;
  textEl.setAttribute('aria-label', 'Edit proposed text');
  textEl.setAttribute('placeholder', 'Edit the proposed text before accepting...');
  // Allow editing proposed text like Cursor does.
  (textEl as HTMLTextAreaElement).setAttribute(
    'data-ageaf-proposed-editor',
    '1'
  );
  const autosize = () => {
    try {
      // Reset first so shrink works too.
      (textEl as HTMLTextAreaElement).style.height = 'auto';
      (textEl as HTMLTextAreaElement).style.height = `${
        (textEl as HTMLTextAreaElement).scrollHeight
      }px`;
    } catch {
      // ignore
    }
  };
  // Size on input + initial mount.
  textEl.addEventListener('input', autosize);
  wrap.appendChild(textEl);
  // After mounting into DOM, scrollHeight becomes stable.
  requestAnimationFrame(() => autosize());

  const actions = document.createElement('div');
  actions.className = 'ageaf-inline-diff-widget__actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'ageaf-inline-diff-btn';
  acceptBtn.textContent = '✓ Accept';
  acceptBtn.setAttribute('aria-label', 'Accept proposed change');
  acceptBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const edited = (textEl as HTMLTextAreaElement).value;
    window.dispatchEvent(
      new CustomEvent(PANEL_ACTION_EVENT, {
        detail: { messageId, action: 'accept', text: edited },
      })
    );
  };
  actions.appendChild(acceptBtn);

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'ageaf-inline-diff-btn is-reject';
  rejectBtn.textContent = '✕ Reject';
  rejectBtn.setAttribute('aria-label', 'Reject proposed change');
  rejectBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    emitOverlayAction(messageId, 'reject');
  };
  actions.appendChild(rejectBtn);

  const feedbackBtn = document.createElement('button');
  feedbackBtn.className = 'ageaf-inline-diff-btn is-feedback';
  feedbackBtn.textContent = 'Feedback';
  feedbackBtn.setAttribute('aria-label', 'Give feedback on proposed change');
  feedbackBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const edited = (textEl as HTMLTextAreaElement).value;
    emitOverlayAction(messageId, 'feedback', edited);
  };
  actions.appendChild(feedbackBtn);

  wrap.appendChild(actions);
  return wrap;
}

function setOverlayWidget(view: any, payload: OverlayWidgetPayload | null) {
  if (!cm6Exports || !overlayEffect) return;

  view.dispatch({
    effects: overlayEffect.of(payload),
  });
  overlayWidgetView = view;
}

function renderOverlay() {
  const view = safeGetCmView();
  if (!view) {
    if (isDebugEnabled()) {
      logOnce('no-view', 'waiting for CodeMirror view to be available…');
    }
    hideReviewBar();
    return;
  }

  // Update the bottom review bar for the currently active file.
  const activeNameForBar = getActiveTabName() ?? '';
  const barItems: Array<{ messageId: string; from: number }> = [];
  for (const payload of overlayById.values()) {
    if (
      payload.filePath &&
      !matchesActiveFile(activeNameForBar, payload.filePath)
    )
      continue;
    if (
      payload.fileName &&
      payload.kind === 'replaceSelection' &&
      !matchesActiveFile(activeNameForBar, payload.fileName)
    ) {
      continue;
    }
    const range = resolveOverlayRange(view, payload);
    if (!range) continue;
    barItems.push({ messageId: payload.messageId, from: range.from });
  }
  barItems.sort((a, b) => a.from - b.from);
  updateReviewBar(activeNameForBar, barItems);

  // If there are no overlays at all, ensure we clear any rendered overlay artifacts and stop.
  if (overlayById.size === 0) {
    // Clear CM6 widget set if previously rendered.
    if (overlayWidgetView && overlayEffect) {
      setOverlayWidget(overlayWidgetView, null);
      overlayWidgetView = null;
    }
    // Clear DOM fallback artifacts if any.
    clearOverlayElements();
    clearGap();
    stopOverlayUpdates();
    hideReviewBar();
    return;
  }

  // Try CM6 widget path first if available, but ONLY if the field is actually installed.
  if (cm6Exports && overlayField && overlayEffect) {
    const activeName = getActiveTabName();
    const widgetPayloads: OverlayWidgetPayload[] = [];
    for (const payload of overlayById.values()) {
      // File gating (best-effort)
      if (payload.filePath && !matchesActiveFile(activeName, payload.filePath))
        continue;
      if (
        payload.fileName &&
        payload.kind === 'replaceSelection' &&
        !matchesActiveFile(activeName, payload.fileName)
      ) {
        continue;
      }
      const range = resolveOverlayRange(view, payload);
      if (!range) continue;
      widgetPayloads.push({
        from: range.to,
        replaceFrom: range.from,
        replaceTo: range.to,
        text: range.newText,
        messageId: payload.messageId,
      });
    }

    if (ensureCm6FieldInstalled(view)) {
      setOverlayWidget(
        view,
        widgetPayloads.length > 0 ? (widgetPayloads as any) : null
      );
      if (widgetPayloads.length > 0) {
        logOnce('cm6-render-multi', 'Rendered inline diffs via CM6 widgets', {
          count: widgetPayloads.length,
        });
      } else {
        logOnce('cm6-clear', 'CM6 widgets cleared (no active ranges)');
      }
      return;
    }
    // If we couldn't install CM6 field yet, continue into DOM fallback.
  }

  // Fallback to DOM overlay

  // DOM fallback (legacy): render only the most recent overlay to avoid layout complexity.
  const overlays = [...overlayById.values()];
  const overlayState = overlays[overlays.length - 1];
  if (!overlayState) return;
  const activeName = getActiveTabName();
  if (
    overlayState.filePath &&
    !matchesActiveFile(activeName, overlayState.filePath)
  ) {
    clearOverlayElements();
    clearGap();
    return;
  }
  if (
    overlayState.fileName &&
    overlayState.kind === 'replaceSelection' &&
    !matchesActiveFile(activeName, overlayState.fileName)
  ) {
    clearOverlayElements();
    clearGap();
    return;
  }

  const range = resolveOverlayRange(view, overlayState);
  if (!range) {
    clearOverlayElements();
    clearGap();
    return;
  }

  ensureOverlayRoot(view);
  if (!overlayRoot) return;
  clearOverlayElements();

  const scrollDOM = view.scrollDOM as HTMLElement;
  const state = view.state;
  const contentDOM = view.contentDOM as HTMLElement;
  ensureContentObserver(contentDOM);
  ensureResizeObserver(scrollDOM);

  // Attach scroll listener once we have a view.
  if (overlayScrollListenerDom !== scrollDOM) {
    try {
      overlayScrollListenerDom?.removeEventListener(
        'scroll',
        scheduleOverlayUpdate
      );
    } catch {
      // ignore
    }
    overlayScrollListenerDom = scrollDOM;
    overlayScrollListenerDom.addEventListener('scroll', scheduleOverlayUpdate, { passive: true });
  }
  if (isDebugEnabled()) {
    logOnce(`rendered:${overlayState.messageId}`, 'rendered overlay', {
      messageId: overlayState.messageId,
      from: range.from,
      to: range.to,
      activeFile: activeName,
    });
  }

  let firstHighlightCoords: { left: number; top: number } | null = null;

  if (range.from !== range.to) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(Math.max(range.from, range.to - 1)).number;
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      const lineFrom = Math.max(line.from, range.from);
      const lineTo = Math.min(line.to, range.to);
      if (lineTo < lineFrom) continue;
      const fromCoords = view.coordsAtPos(lineFrom);
      if (!fromCoords) continue;

      // Use the actual line DOM rect so highlight/strike cover the full wrapped line width.
      const lineEl = findLineAtY(contentDOM, fromCoords.top + 1);
      const lineRect = lineEl?.getBoundingClientRect();
      const relLine = lineRect
        ? toRelativeCoords(scrollDOM, lineRect)
        : toRelativeCoords(scrollDOM, fromCoords);
      const height = lineRect
        ? Math.max(1, relLine.bottom - relLine.top)
        : Math.max(1, relLine.bottom - relLine.top);
      const width = lineRect
        ? Math.max(12, relLine.right - relLine.left)
        : Math.max(12, scrollDOM.clientWidth - relLine.left - 16);

      const block = document.createElement('div');
      block.className = 'ageaf-inline-diff-old';
      block.style.left = `${relLine.left}px`;
      block.style.top = `${relLine.top}px`;
      block.style.width = `${width}px`;
      block.style.height = `${height}px`;
      overlayRoot.appendChild(block);

      if (!firstHighlightCoords) {
        firstHighlightCoords = { left: relLine.left, top: relLine.top };
      }
    }
  }

  // Render proposed text as an overlay block, and reserve layout space with a spacer.
  const startCoords = view.coordsAtPos(range.from);
  const endCoords = view.coordsAtPos(range.to) ?? startCoords;
  if (range.newText && startCoords && endCoords) {
    const endLineElForPos = findLineAtY(contentDOM, endCoords.bottom - 1);
    const endLineRect = endLineElForPos?.getBoundingClientRect() ?? null;

    if (!endLineElForPos) {
      clearGap();
      return;
    }

    // Anchor to the actual DOM line bottom so we don't overlap wrapped lines.
    const relLine = endLineRect
      ? toRelativeCoords(scrollDOM, endLineRect)
      : toRelativeCoords(scrollDOM, endCoords);
    const rel = { left: relLine.left, top: relLine.bottom + 8 };

    const added = document.createElement('div');
    added.className = 'ageaf-inline-diff-addition';
    added.style.left = `${rel.left}px`;
    added.style.top = `${rel.top}px`;
    const availableWidth = Math.max(220, scrollDOM.clientWidth - rel.left - 24);
    added.style.width = `${availableWidth}px`;
    added.style.maxWidth = `${availableWidth}px`;

    const actions = document.createElement('div');
    actions.className = 'ageaf-inline-diff-addition__actions';

    const accept = document.createElement('button');
    accept.className = 'ageaf-inline-diff-btn';
    accept.textContent = '✓ Accept';
    accept.type = 'button';
    accept.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      emitOverlayAction(overlayState.messageId, 'accept');
    });

    const feedback = document.createElement('button');
    feedback.className = 'ageaf-inline-diff-btn is-feedback';
    feedback.textContent = 'Feedback';
    feedback.type = 'button';
    feedback.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      emitOverlayAction(overlayState.messageId, 'feedback', range.newText);
    });

    const reject = document.createElement('button');
    reject.className = 'ageaf-inline-diff-btn is-reject';
    reject.textContent = '✕ Reject';
    reject.type = 'button';
    reject.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      emitOverlayAction(overlayState.messageId, 'reject');
    });

    actions.appendChild(accept);
    actions.appendChild(reject);
    actions.appendChild(feedback);

    const text = document.createElement('div');
    text.className = 'ageaf-inline-diff-addition__text';
    text.textContent = range.newText;
    const contentStyle = window.getComputedStyle(contentDOM);
    text.style.fontFamily = contentStyle.fontFamily;
    text.style.fontSize = contentStyle.fontSize;
    text.style.lineHeight = contentStyle.lineHeight;

    const fontSize = Number.parseFloat(contentStyle.fontSize);
    const lineHeightValue = Number.parseFloat(contentStyle.lineHeight);
    const resolvedLineHeight = Number.isFinite(lineHeightValue)
      ? lineHeightValue
      : Number.isFinite(fontSize)
      ? fontSize * 1.3
      : 16;
    // 2-3 empty lines for the buttons, inside the green paragraph.
    text.style.paddingBottom = `${Math.round(resolvedLineHeight * 2.6 + 10)}px`;

    added.appendChild(text);
    added.appendChild(actions);
    overlayRoot.appendChild(added);

    // Reserve layout space so following lines don't fall into the overlay.
    window.requestAnimationFrame(() => {
      if (!added.isConnected) return;
      const height = Math.ceil(added.getBoundingClientRect().height) + 10;
      if (height <= 0) return;
      isMutatingEditorDom = true;
      try {
        ensureGapSpacerAfter(endLineElForPos);
        if (gapSpacerEl && Math.abs(lastGapPx - height) > 1) {
          gapSpacerEl.style.height = `${height}px`;
          lastGapPx = height;
        }
      } finally {
        isMutatingEditorDom = false;
      }
    });
  } else {
    clearGap();
  }
}

function emitOverlayAction(
  messageId: string | undefined,
  action: 'accept' | 'reject' | 'feedback',
  text?: string
) {
  if (!messageId) return;
  window.dispatchEvent(
    new CustomEvent(PANEL_ACTION_EVENT, {
      detail: {
        messageId,
        action,
        ...(typeof text === 'string' ? { text } : {}),
      },
    })
  );
}

function startOverlayUpdates() {
  if (overlayUpdateTimer != null) return;
  overlayUpdateTimer = window.setInterval(() => {
    renderOverlay();
  }, 250);
  window.addEventListener('resize', scheduleOverlayUpdate);
  // scroll listener is attached lazily once a view is available.
}

function stopOverlayUpdates() {
  if (overlayUpdateTimer != null) {
    window.clearInterval(overlayUpdateTimer);
    overlayUpdateTimer = null;
  }
  window.removeEventListener('resize', scheduleOverlayUpdate);
  try {
    overlayScrollListenerDom?.removeEventListener(
      'scroll',
      scheduleOverlayUpdate
    );
  } catch {
    // ignore
  }
  overlayScrollListenerDom = null;
  stopContentObserver();
  stopResizeObserver();
}

function clearOverlay() {
  overlayById.clear();
  stopOverlayUpdates();
  hideReviewBar();

  // Clear CM6 widget if active
  if (overlayWidgetView && overlayEffect) {
    setOverlayWidget(overlayWidgetView, null);
    overlayWidgetView = null;
  }

  overlayRoot?.remove();
  overlayRoot = null;
  overlayScrollDom = null;
  clearGap();
}

function onOverlayShow(event: Event) {
  const detail = (event as CustomEvent<OverlayPayload>).detail;
  if (!detail?.messageId || !detail.kind) return;
  ensureInlineDiffStyles();
  overlayById.set(String(detail.messageId), detail);
  startOverlayUpdates();
  scheduleOverlayUpdate();
  if (isDebugEnabled()) {
    logOnce(`show:${detail.messageId}`, 'received overlay show', detail);
  }
}

function onOverlayClear(event: Event) {
  const detail = (event as CustomEvent<{ messageId?: string }>).detail;
  if (detail?.messageId) {
    overlayById.delete(String(detail.messageId));
    // If that was the last one, fully clear (also hides bar). Otherwise re-render.
    if (overlayById.size === 0) {
      clearOverlay();
    } else {
      scheduleOverlayUpdate();
    }
    return;
  }
  clearOverlay();
  if (isDebugEnabled()) {
    logOnce('clear', 'overlay cleared');
  }
}

export function registerInlineDiffOverlay() {
  window.addEventListener(OVERLAY_SHOW_EVENT, onOverlayShow as EventListener);
  window.addEventListener(OVERLAY_CLEAR_EVENT, onOverlayClear as EventListener);

  // Listen for Overleaf's UNSTABLE_editor:extensions event to get CM6 classes
  window.addEventListener('UNSTABLE_editor:extensions', ((
    event: CustomEvent
  ) => {
    const { CodeMirror } = event.detail || {};
    if (!CodeMirror) {
      logOnce(
        'cm6-event-no-cm',
        'UNSTABLE_editor:extensions event received but no CodeMirror object'
      );
      return;
    }

    // Overleaf can expose these either flat or nested under {view,state}.
    const viewNS = CodeMirror.view || CodeMirror;
    const stateNS = CodeMirror.state || CodeMirror;

    const Decoration = viewNS.Decoration || CodeMirror.Decoration;
    const EditorView = viewNS.EditorView || CodeMirror.EditorView;
    const WidgetType = viewNS.WidgetType || CodeMirror.WidgetType;
    const StateEffect = stateNS.StateEffect || CodeMirror.StateEffect;
    const StateField = stateNS.StateField || CodeMirror.StateField;
    const EditorState = stateNS.EditorState || CodeMirror.EditorState;
    const Compartment = stateNS.Compartment || CodeMirror.Compartment;

    if (
      !Decoration ||
      !EditorView ||
      !StateEffect ||
      !StateField ||
      !WidgetType
    ) {
      logOnce('cm6-missing-classes', 'CM6 classes incomplete', {
        hasDecoration: !!Decoration,
        hasEditorView: !!EditorView,
        hasStateEffect: !!StateEffect,
        hasStateField: !!StateField,
        hasWidgetType: !!WidgetType,
      });
      return;
    }

    cm6Exports = {
      Decoration,
      EditorView,
      EditorState,
      StateEffect,
      StateField,
      WidgetType,
      Compartment,
    };

    // Expose resolved CM6 exports for other Ageaf features that may register
    // their event listeners after Overleaf fires UNSTABLE_editor:extensions.
    try {
      (window as any).__ageafCm6Exports = cm6Exports;
      window.dispatchEvent(
        new CustomEvent('ageaf:cm6:resolved', { detail: { cm6Exports } })
      );
    } catch {
      // ignore
    }

    logOnce('cm6-resolved', 'CM6 classes resolved from Overleaf event', {
      keys: Object.keys(CodeMirror).slice(0, 30),
      hasViewNS: !!CodeMirror.view,
      hasStateNS: !!CodeMirror.state,
      hasCompartment: !!Compartment,
      hasAppendConfig: !!StateEffect?.appendConfig,
    });

    // Initialize the overlay system
    initializeCm6Overlay(cm6Exports);

    // If we already have overlay state(s), trigger a re-render
    if (overlayById.size > 0) {
      scheduleOverlayUpdate();
    }
  }) as EventListener);

  // Flag for consumers (panel) that may mount after the ready event has fired.
  (window as any).__ageafOverlayReady = true;
  window.dispatchEvent(new CustomEvent(OVERLAY_READY_EVENT));

  // Rehydrate last overlay after refresh (best-effort).
  const tryRestoreFromStorage = () => {
    if (overlayById.size > 0) return;
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY_INLINE_OVERLAY);
      if (raw) {
        const parsed = JSON.parse(raw) as OverlayPayload | OverlayPayload[];
        const list = Array.isArray(parsed)
          ? parsed
          : parsed?.messageId
          ? [parsed]
          : [];
        if (list.length > 0) {
          const currentProjectId = getCurrentProjectId();
          for (const stored of list) {
            if (!stored?.messageId) continue;
            if (
              !stored.projectId ||
              !currentProjectId ||
              stored.projectId === currentProjectId
            ) {
              onOverlayShow(
                new CustomEvent(OVERLAY_SHOW_EVENT, { detail: stored }) as any
              );
            }
          }
          return;
        }
      }
    } catch {
      // ignore storage errors
    }

    // Fallback to chrome.storage.local if present (older persistence).
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get([LOCAL_STORAGE_KEY_INLINE_OVERLAY], (data) => {
          if (overlayById.size > 0) return;
          const storedAny = data?.[LOCAL_STORAGE_KEY_INLINE_OVERLAY] as
            | OverlayPayload
            | OverlayPayload[]
            | undefined;
          const list = Array.isArray(storedAny)
            ? storedAny
            : storedAny?.messageId
            ? [storedAny]
            : [];
          if (list.length === 0) return;
          const currentProjectId = getCurrentProjectId();
          for (const stored of list) {
            if (!stored?.messageId) continue;
            if (
              !stored.projectId ||
              !currentProjectId ||
              stored.projectId === currentProjectId
            ) {
              onOverlayShow(
                new CustomEvent(OVERLAY_SHOW_EVENT, { detail: stored }) as any
              );
            }
          }
        });
      }
    } catch {
      // ignore storage errors
    }
  };

  tryRestoreFromStorage();
}
