import { getContentAfterCursor, getContentBeforeCursor, getCmView } from '../helpers';
import { onReplaceContent } from '../eventHandlers';
import { MAX_LENGTH_AFTER_CURSOR, MAX_LENGTH_BEFORE_CURSOR } from '../../constants';

const REQUEST_EVENT = 'ageaf:editor:request';
const RESPONSE_EVENT = 'ageaf:editor:response';
const REPLACE_EVENT = 'ageaf:editor:replace';
const INSERT_EVENT = 'ageaf:editor:insert';
const FILE_REQUEST_EVENT = 'ageaf:editor:file-content:request';
const FILE_RESPONSE_EVENT = 'ageaf:editor:file-content:response';

interface SelectionRequest {
  requestId: string;
}

interface SelectionResponse {
  requestId: string;
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

interface FileContentRequest {
  requestId: string;
  name: string;
}

interface FileContentResponse {
  requestId: string;
  name: string;
  content: string;
  activeName: string | null;
  ok: boolean;
  error?: string;
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

  let ok = true;
  let error: string | undefined;

  try {
    if (requested && (!originalName || originalName.trim() !== requested)) {
      const activated = await tryActivateFileByName(requested);
      if (activated) {
        await waitForDocChange(beforeHash, 2500);
      }
    }
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
  }

  const activeName = getActiveTabName();
  const content = view.state.sliceDoc(0, view.state.doc.length);

  // Best-effort restore previous active file (avoid disrupting the user).
  try {
    if (originalName && activeName && originalName !== activeName) {
      const restore = findClickableByName(originalName);
      restore?.click();
    }
  } catch {
    // ignore restore errors
  }

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

  const inclusiveEnd = to > from ? Math.max(from, to - 1) : to;
  const response: SelectionResponse = {
    requestId: detail.requestId,
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

export function registerEditorBridge() {
  window.addEventListener(REQUEST_EVENT, onSelectionRequest as EventListener);
  window.addEventListener(FILE_REQUEST_EVENT, onFileContentRequest as EventListener);
  window.addEventListener(REPLACE_EVENT, onReplaceSelection as EventListener);
  window.addEventListener(INSERT_EVENT, onInsertAtCursor as EventListener);
}
