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

let overlayRoot: HTMLDivElement | null = null;
let overlayState: OverlayPayload | null = null;
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
      font-size: 11px;
      font-weight: 600;
      padding: 3px 6px;
      border-radius: 6px;
      background: rgba(16, 185, 129, 0.2);
      color: rgba(10, 35, 25, 0.92);
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    .ageaf-inline-diff-btn.is-reject {
      background: rgba(239, 68, 68, 0.2);
      color: rgba(35, 10, 10, 0.92);
      border: 1px solid rgba(239, 68, 68, 0.4);
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
      color: rgba(10, 35, 25, 0.96);
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
      color: rgba(10, 35, 25, 0.96);
    }

    .ageaf-inline-diff-widget__actions {
      position: absolute;
      right: 10px;
      bottom: 10px;
      display: inline-flex;
      gap: 8px;
      flex: 0 0 auto;
    }

    /* CM6 line decoration for the red "old" area */
    .cm-line.ageaf-inline-diff-old-line {
      background: rgba(239, 68, 68, 0.14);
    }
  `;
  document.head.appendChild(style);
}

function normalizeFileName(filePath: string): string {
  const trimmed = filePath.trim();
  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : trimmed;
}

function getActiveTabName(): string | null {
  const selected =
    document.querySelector('[role="tab"][aria-selected="true"]') ??
    document.querySelector('.cm-tab.is-active, .cm-tab[aria-selected="true"]') ??
    document.querySelector('.cm-tab--active');
  if (!(selected instanceof HTMLElement)) return null;
  const text = (selected.getAttribute('aria-label') ?? selected.textContent ?? '').trim();
  return text || null;
}

function matchesActiveFile(activeName: string | null, filePath: string): boolean {
  // If we can't detect the active tab name (Overleaf DOM not ready / changed),
  // do NOT block rendering—range resolution will fail safely if it's the wrong file.
  if (!activeName) return true;
  const active = activeName.trim().toLowerCase();
  const target = filePath.trim().toLowerCase();
  const base = normalizeFileName(target).toLowerCase();
  return active === target || active === base;
}

function findUniqueRange(fullText: string, needle: string) {
  if (!needle) return null;
  const first = fullText.indexOf(needle);
  if (first === -1) return null;
  const second = fullText.indexOf(needle, first + needle.length);
  if (second !== -1) return null;
  return { from: first, to: first + needle.length };
}

function resolveOverlayRange(view: ReturnType<typeof getCmView>, payload: OverlayPayload): OverlayRange | null {
  const state = view.state;
  const fullText = state.sliceDoc(0, state.doc.length);
  const oldText = payload.oldText ?? '';
  const newText = payload.newText ?? '';

  if (payload.kind === 'insertAtCursor') {
    const head = state.selection.main.head;
    return { from: head, to: head, oldText: '', newText };
  }

  if (typeof payload.from === 'number' && typeof payload.to === 'number' && payload.to >= payload.from) {
    const current = state.sliceDoc(payload.from, payload.to);
    if (!oldText || current === oldText) {
      return { from: payload.from, to: payload.to, oldText: current, newText };
    }
  }

  if (oldText) {
    const resolved = findUniqueRange(fullText, oldText);
    if (resolved) {
      return { ...resolved, oldText, newText };
    }
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
  if (gapAnchorEl !== targetEl || gapSpacerEl.parentElement !== targetEl.parentElement) {
    gapSpacerEl.remove();
    targetEl.after(gapSpacerEl);
    gapAnchorEl = targetEl;
  }
}

function findLineAtY(contentDOM: HTMLElement, y: number) {
  const lines = Array.from(contentDOM.querySelectorAll<HTMLElement>('.cm-line'));
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

function toRelativePoint(scrollDOM: HTMLElement, point: { left: number; top: number }) {
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

  const { StateEffect, StateField, Decoration, EditorView, Compartment, WidgetType } = cm6;

  // Create effect type for setting overlay payload
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

  // Create StateField to manage decorations
  overlayField = StateField.define({
    create() {
      return Decoration.none;
    },
    update(decorations: any, tr: any) {
      decorations = decorations.map(tr.changes);
      for (const e of tr.effects) {
        if (e.is(overlayEffect)) {
          if (e.value) {
            const widget = new WidgetClass(e.value.text, e.value.messageId);
            const items: any[] = [];

            // Old region highlight (red) using line decorations so it spans the full editor width.
            const rf = Number(e.value.replaceFrom);
            const rt = Number(e.value.replaceTo);
            if (Number.isFinite(rf) && Number.isFinite(rt) && rt > rf) {
              try {
                const doc = tr.state.doc;
                const startLine = doc.lineAt(rf).number;
                const endLine = doc.lineAt(Math.max(rf, rt - 1)).number;
                for (let ln = startLine; ln <= endLine; ln += 1) {
                  const line = doc.line(ln);
                  items.push(
                    Decoration.line({ attributes: { class: 'ageaf-inline-diff-old-line' } }).range(
                      line.from
                    )
                  );
                }
              } catch {
                // ignore
              }
            }

            // Proposed region (green) block widget inserted after selection.
            items.push(
              Decoration.widget({
                widget,
                block: true,
                side: 1,
              }).range(e.value.from)
            );

            decorations = Decoration.set(items);
          } else {
            decorations = Decoration.none;
          }
        }
      }
      return decorations;
    },
    provide: (f: any) => EditorView.decorations.from(f),
  });

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
    const ext = overlayCompartment ? overlayCompartment.of(overlayField) : overlayField;
    // Preferred dynamic append
    const append = cm6Exports.StateEffect?.appendConfig;
    if (!append?.of) {
      logOnce('cm6-no-appendConfig', 'CM6 StateEffect.appendConfig missing; cannot inject field');
      return false;
    }
    view.dispatch({ effects: append.of(ext) });
  } catch (err: any) {
    logOnce('cm6-inject-error', 'Failed to inject CM6 field', { error: err?.message });
    return false;
  }

  if (isCm6FieldInstalled(view)) {
    overlayInstalledViews?.add(view);
    logOnce('cm6-field-installed', 'CM6 overlay field installed in view');
    return true;
  }

  logOnce('cm6-field-not-yet', 'CM6 overlay field not yet available after inject attempt');
  return false;
}

function createWidgetDOM(text: string, messageId: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ageaf-inline-diff-widget';
  wrap.setAttribute('data-message-id', messageId);

  const textEl = document.createElement('div');
  textEl.className = 'ageaf-inline-diff-widget__text';
  textEl.textContent = text;
  wrap.appendChild(textEl);

  const actions = document.createElement('div');
  actions.className = 'ageaf-inline-diff-widget__actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'ageaf-inline-diff-btn';
  acceptBtn.textContent = '✓ Accept';
  acceptBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent(PANEL_ACTION_EVENT, {
        detail: { messageId, action: 'accept' },
      })
    );
  };
  actions.appendChild(acceptBtn);

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'ageaf-inline-diff-btn is-reject';
  rejectBtn.textContent = '✕ Reject';
  rejectBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent(PANEL_ACTION_EVENT, {
        detail: { messageId, action: 'reject' },
      })
    );
  };
  actions.appendChild(rejectBtn);

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
  if (!overlayState) return;
  const view = safeGetCmView();
  if (!view) {
    if (isDebugEnabled()) {
      logOnce('no-view', 'waiting for CodeMirror view to be available…');
    }
    return;
  }

  // Try CM6 widget path first if available, but ONLY if the field is actually installed.
  if (cm6Exports && overlayField && overlayEffect) {
    const range = resolveOverlayRange(view, overlayState);
    if (!range) {
      if (ensureCm6FieldInstalled(view)) {
        setOverlayWidget(view, null);
        logOnce('cm6-clear', 'CM6 widget cleared (range missing)');
        return;
      }
      // If CM6 isn't installed yet, fall back to DOM overlay clearing below.
    }
    if (range && ensureCm6FieldInstalled(view)) {
      setOverlayWidget(view, {
        from: range.to,
        replaceFrom: range.from,
        replaceTo: range.to,
        text: range.newText,
        messageId: overlayState.messageId,
      });
      logOnce('cm6-render', 'Rendered inline diff via CM6 widget', {
        messageId: overlayState.messageId,
        at: range.to,
      });
      return;
    }
    // If we couldn't install CM6 field yet, continue into DOM fallback.
  }

  // Fallback to DOM overlay

  const activeName = getActiveTabName();
  if (
    overlayState.filePath &&
    !matchesActiveFile(activeName, overlayState.filePath)
  ) {
    clearOverlayElements();
    clearGap();
    if (isDebugEnabled()) {
      logOnce(
        `file-mismatch:${overlayState.filePath}:${activeName ?? 'unknown'}`,
        'file mismatch; not rendering overlay yet',
        { expected: overlayState.filePath, active: activeName }
      );
    }
    return;
  }
  if (
    overlayState.fileName &&
    overlayState.kind === 'replaceSelection' &&
    !matchesActiveFile(activeName, overlayState.fileName)
  ) {
    clearOverlayElements();
    clearGap();
    if (isDebugEnabled()) {
      logOnce(
        `file-mismatch:${overlayState.fileName}:${activeName ?? 'unknown'}`,
        'file mismatch; not rendering overlay yet',
        { expected: overlayState.fileName, active: activeName }
      );
    }
    return;
  }

  const range = resolveOverlayRange(view, overlayState);
  if (!range) {
    clearOverlayElements();
    clearGap();
    if (isDebugEnabled()) {
      logOnce(
        `range-missing:${overlayState.messageId}`,
        'unable to resolve overlay range (selection moved or text not found/ambiguous)'
      );
    }
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
      overlayScrollListenerDom?.removeEventListener('scroll', scheduleOverlayUpdate);
    } catch {
      // ignore
    }
    overlayScrollListenerDom = scrollDOM;
    overlayScrollListenerDom.addEventListener('scroll', scheduleOverlayUpdate);
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
      const relLine =
        lineRect ? toRelativeCoords(scrollDOM, lineRect) : toRelativeCoords(scrollDOM, fromCoords);
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
      emitOverlayAction('accept');
    });

    const reject = document.createElement('button');
    reject.className = 'ageaf-inline-diff-btn is-reject';
    reject.textContent = '✕ Reject';
    reject.type = 'button';
    reject.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      emitOverlayAction('reject');
    });

    actions.appendChild(accept);
    actions.appendChild(reject);

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

function emitOverlayAction(action: 'accept' | 'reject') {
  if (!overlayState?.messageId) return;
  window.dispatchEvent(
    new CustomEvent(PANEL_ACTION_EVENT, {
      detail: { messageId: overlayState.messageId, action },
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
    overlayScrollListenerDom?.removeEventListener('scroll', scheduleOverlayUpdate);
  } catch {
    // ignore
  }
  overlayScrollListenerDom = null;
  stopContentObserver();
  stopResizeObserver();
}

function clearOverlay() {
  overlayState = null;
  stopOverlayUpdates();
  
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
  overlayState = detail;
  startOverlayUpdates();
  scheduleOverlayUpdate();
  if (isDebugEnabled()) {
    logOnce(`show:${detail.messageId}`, 'received overlay show', detail);
  }
}

function onOverlayClear() {
  clearOverlay();
  if (isDebugEnabled()) {
    logOnce('clear', 'overlay cleared');
  }
}

export function registerInlineDiffOverlay() {
  window.addEventListener(OVERLAY_SHOW_EVENT, onOverlayShow as EventListener);
  window.addEventListener(OVERLAY_CLEAR_EVENT, onOverlayClear as EventListener);
  
  // Listen for Overleaf's UNSTABLE_editor:extensions event to get CM6 classes
  window.addEventListener('UNSTABLE_editor:extensions', ((event: CustomEvent) => {
    const { CodeMirror } = event.detail || {};
    if (!CodeMirror) {
      logOnce('cm6-event-no-cm', 'UNSTABLE_editor:extensions event received but no CodeMirror object');
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
    const Compartment = stateNS.Compartment || CodeMirror.Compartment;

    if (!Decoration || !EditorView || !StateEffect || !StateField || !WidgetType) {
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
      StateEffect,
      StateField,
      WidgetType,
      Compartment,
    };

    logOnce('cm6-resolved', 'CM6 classes resolved from Overleaf event', {
      keys: Object.keys(CodeMirror).slice(0, 30),
      hasViewNS: !!CodeMirror.view,
      hasStateNS: !!CodeMirror.state,
      hasCompartment: !!Compartment,
      hasAppendConfig: !!StateEffect?.appendConfig,
    });

    // Initialize the overlay system
    initializeCm6Overlay(cm6Exports);

    // If we already have overlay state, trigger a re-render
    if (overlayState) {
      scheduleOverlayUpdate();
    }
  }) as EventListener);

  // Flag for consumers (panel) that may mount after the ready event has fired.
  (window as any).__ageafOverlayReady = true;
  window.dispatchEvent(new CustomEvent(OVERLAY_READY_EVENT));

  // Rehydrate last overlay after refresh (best-effort).
  const tryRestoreFromStorage = () => {
    if (overlayState) return;
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY_INLINE_OVERLAY);
      if (raw) {
        const stored = JSON.parse(raw) as OverlayPayload;
        if (stored?.messageId) {
          const currentProjectId = getCurrentProjectId();
          if (!stored.projectId || !currentProjectId || stored.projectId === currentProjectId) {
            if (isDebugEnabled()) {
              logOnce(`restore:${stored.messageId}`, 'restoring overlay from localStorage', stored);
            }
            onOverlayShow(new CustomEvent(OVERLAY_SHOW_EVENT, { detail: stored }) as any);
            return;
          }
        }
      }
    } catch {
      // ignore storage errors
    }

    // Fallback to chrome.storage.local if present (older persistence).
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get([LOCAL_STORAGE_KEY_INLINE_OVERLAY], (data) => {
          if (overlayState) return;
          const stored = data?.[LOCAL_STORAGE_KEY_INLINE_OVERLAY] as OverlayPayload | undefined;
          if (!stored?.messageId) return;
          const currentProjectId = getCurrentProjectId();
          if (!stored.projectId || !currentProjectId || stored.projectId === currentProjectId) {
            onOverlayShow(new CustomEvent(OVERLAY_SHOW_EVENT, { detail: stored }) as any);
          }
        });
      }
    } catch {
      // ignore storage errors
    }
  };

  tryRestoreFromStorage();
}

