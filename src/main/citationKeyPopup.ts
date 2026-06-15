import { getCmView } from './helpers';
import { detectProjectFilesFromDom } from '../iso/panel/Panel';
import { parseBibTeXFile } from './citations/bibTeXParser';
import type { Cm6ExportsLite } from './citations/citationDecorations';

type OverleafExtensionsEvent = CustomEvent<{ CodeMirror?: any }>;

type BibEntryMeta = {
  key: string;
  fileName: string;
  filePath: string;
  title?: string;
  author?: string;
  year?: string;
  journal?: string;
  booktitle?: string;
  publisher?: string;
  entryType?: string;
};

type BibIndex = {
  byKey: Map<string, BibEntryMeta[]>;
  builtAt: number;
  projectId: string | null;
};

const STYLE_ID = 'ageaf-citation-key-popup-style';

let cm6: Cm6ExportsLite | null = null;
let installedViews: WeakSet<any> | null = null;
let lastInstallAttemptAt = 0;

let popupEl: HTMLDivElement | null = null;
let popupFor: { key: string; at: number } | null = null;

let indexCache: BibIndex | null = null;
const INDEX_TTL_MS = 2 * 60 * 1000;

function safeGetCmView(): ReturnType<typeof getCmView> | null {
  try {
    return getCmView();
  } catch {
    return null;
  }
}

function getProjectIdFromPathname(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const idx = segments.findIndex((s) => s.toLowerCase() === 'project');
  if (idx === -1) return null;
  return segments[idx + 1] || null;
}

async function fetchDocDownload(projectId: string, docId: string): Promise<string> {
  const candidates = [
    `/Project/${encodeURIComponent(projectId)}/doc/${encodeURIComponent(docId)}/download`,
    `/project/${encodeURIComponent(projectId)}/doc/${encodeURIComponent(docId)}/download`,
  ];
  let lastErr: unknown = null;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) {
        lastErr = new Error(`HTTP ${resp.status} for ${url}`);
        continue;
      }
      return await resp.text();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to fetch doc download');
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* DEFAULT STATE: Dark Mode (Emerald Studio Theme) */
    .ageaf-cite-popup {
      position: fixed;
      z-index: 2147483647;
      max-width: 460px;
      background: rgba(15, 20, 17, 0.94);
      border: 1px solid rgba(57, 185, 138, 0.18);
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(57, 185, 138, 0.08);
      padding: 12px 12px;
      font-family: 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: rgba(255, 255, 255, 0.92);
      animation: ageaf-popup-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .ageaf-cite-popup::after {
      content: '';
      position: absolute;
      top: -6px;
      left: var(--caret-left, 20px);
      width: 12px;
      height: 12px;
      background: rgba(15, 20, 17, 0.94);
      border-left: 1px solid rgba(57, 185, 138, 0.18);
      border-top: 1px solid rgba(57, 185, 138, 0.18);
      transform: rotate(45deg);
      pointer-events: none;
    }

    .ageaf-cite-popup.is-below::after {
      top: auto;
      bottom: -6px;
      transform: rotate(225deg);
    }

    .ageaf-cite-popup__title {
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 2px 0;
      line-height: 1.25;
    }

    .ageaf-cite-popup__meta {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.68);
      margin: 0 0 8px 0;
      line-height: 1.35;
    }

    .ageaf-cite-popup__badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      border-radius: 8px;
      padding: 2px 8px;
      background: rgba(57, 185, 138, 0.12);
      border: 1px solid rgba(57, 185, 138, 0.25);
      color: #4dd4a4;
      margin-right: 6px;
    }

    .ageaf-cite-popup__cite {
      margin-top: 6px;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.86);
      background: rgba(57, 185, 138, 0.06);
      border: 1px solid rgba(57, 185, 138, 0.15);
      border-radius: 8px;
      padding: 6px 8px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    /* LIGHT MODE OVERRIDES: Applied when Ageaf panel is in light mode */
    body[data-ageaf-theme="light"] .ageaf-cite-popup {
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(15, 23, 42, 0.12);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
      color: rgba(15, 23, 42, 0.92);
    }

    body[data-ageaf-theme="light"] .ageaf-cite-popup::after {
      background: rgba(255, 255, 255, 0.96);
      border-left: 1px solid rgba(15, 23, 42, 0.12);
      border-top: 1px solid rgba(15, 23, 42, 0.12);
    }

    body[data-ageaf-theme="light"] .ageaf-cite-popup .ageaf-cite-popup__meta {
      color: rgba(71, 85, 105, 0.86);
    }

    body[data-ageaf-theme="light"] .ageaf-cite-popup .ageaf-cite-popup__badge {
      color: #39b98a;
    }

    body[data-ageaf-theme="light"] .ageaf-cite-popup .ageaf-cite-popup__cite {
      color: rgba(15, 23, 42, 0.86);
      background: rgba(15, 23, 42, 0.04);
      border: 1px solid rgba(15, 23, 42, 0.08);
    }

    @keyframes ageaf-popup-enter {
      from { opacity: 0; transform: translateY(4px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .ageaf-cite-popup { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

function closePopup() {
  popupFor = null;
  if (popupEl) {
    popupEl.remove();
    popupEl = null;
  }
}

function ensurePopup() {
  if (popupEl) return popupEl;
  const el = document.createElement('div');
  el.className = 'ageaf-cite-popup';
  el.addEventListener('click', (e) => {
    // keep clicks inside popup from closing it
    e.stopPropagation();
  });
  popupEl = el;
  document.body.appendChild(el);
  return el;
}

function escapeText(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!));
}

function renderPopup(meta: BibEntryMeta | null, key: string, citeText: string, coords: { left: number; top: number }) {
  ensureStyles();
  const el = ensurePopup();
  const title = meta?.title ?? `Citation not found: ${key}`;
  const parts: string[] = [];
  if (meta?.author) parts.push(meta.author);
  if (meta?.year) parts.push(meta.year);
  if (meta?.journal) parts.push(meta.journal);
  if (meta?.booktitle) parts.push(meta.booktitle);
  if (meta?.publisher) parts.push(meta.publisher);
  const metaLine = parts.filter(Boolean).join(' · ');
  const badges = [];
  if (meta?.year) badges.push(`<span class="ageaf-cite-popup__badge">${escapeText(meta.year)}</span>`);
  if (meta?.fileName) badges.push(`<span class="ageaf-cite-popup__badge">${escapeText(meta.fileName)}</span>`);
  el.innerHTML = `
    <div class="ageaf-cite-popup__title">${escapeText(title)}</div>
    <div class="ageaf-cite-popup__meta">${badges.join('')}${escapeText(metaLine || meta?.filePath || '')}</div>
    <div class="ageaf-cite-popup__cite">${escapeText(citeText)}</div>
  `;
  // Position — determine if popup should appear above or below
  const margin = 10;
  const popupHeight = el.offsetHeight;
  const popupWidth = el.offsetWidth;
  const maxLeft = window.innerWidth - popupWidth - margin;

  // Try below first (default); if not enough space, go above
  const spaceBelow = window.innerHeight - coords.top - margin;
  const isBelow = spaceBelow < popupHeight + margin && coords.top - popupHeight > margin;

  const left = Math.max(margin, Math.min(coords.left, maxLeft));
  const top = isBelow
    ? Math.max(margin, coords.top - popupHeight - 12)
    : Math.max(margin, Math.min(coords.top, window.innerHeight - popupHeight - margin));

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  // Toggle caret direction class
  el.classList.toggle('is-below', isBelow);

  // Position caret horizontally near the cursor
  const caretLeft = Math.max(12, Math.min(coords.left - left, popupWidth - 24));
  el.style.setProperty('--caret-left', `${caretLeft}px`);
}

function extractFieldValue(entryBlock: string, fieldName: string): string | undefined {
  const re = new RegExp(`(^|[\\s,])${fieldName}\\s*=\\s*`, 'i');
  const m = re.exec(entryBlock);
  if (!m) return undefined;
  let i = (m.index ?? 0) + m[0].length;
  while (i < entryBlock.length && /\s/.test(entryBlock[i]!)) i++;
  const first = entryBlock[i];
  if (first === '"') {
    i++;
    let out = '';
    while (i < entryBlock.length) {
      const ch = entryBlock[i]!;
      if (ch === '"' && entryBlock[i - 1] !== '\\') break;
      out += ch;
      i++;
    }
    return out.trim() || undefined;
  }
  if (first === '{') {
    i++;
    let depth = 1;
    let out = '';
    while (i < entryBlock.length && depth > 0) {
      const ch = entryBlock[i]!;
      if (ch === '{') {
        depth++;
        out += ch;
      } else if (ch === '}') {
        depth--;
        if (depth > 0) out += ch;
      } else {
        out += ch;
      }
      i++;
    }
    return out.replace(/\s+/g, ' ').trim() || undefined;
  }
  let out = '';
  while (i < entryBlock.length) {
    const ch = entryBlock[i]!;
    if (ch === ',' || ch === '\n' || ch === '\r') break;
    out += ch;
    i++;
  }
  return out.trim() || undefined;
}

function normalizeAuthor(raw: string): string {
  return raw.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

async function buildBibIndex(): Promise<BibIndex> {
  const projectId = getProjectIdFromPathname(window.location.pathname);
  const files = detectProjectFilesFromDom();
  const bibDocs = files.filter((f: any) => f.ext === 'bib' && f.entityType === 'doc' && typeof f.id === 'string');
  const byKey = new Map<string, BibEntryMeta[]>();

  if (!projectId || bibDocs.length === 0) {
    return { byKey, builtAt: Date.now(), projectId };
  }

  for (const bib of bibDocs as any[]) {
    try {
      const content = await fetchDocDownload(projectId, bib.id as string);
      const entries = parseBibTeXFile(content);
      for (const e of entries) {
        const block = content.slice(e.startPos, Math.min(e.endPos, content.length));
        const entryTypeMatch = block.match(/@(\w+)\s*\{/);
        const meta: BibEntryMeta = {
          key: e.key,
          fileName: bib.name,
          filePath: bib.path,
          entryType: entryTypeMatch?.[1],
          title: extractFieldValue(block, 'title'),
          author: (() => {
            const a = extractFieldValue(block, 'author');
            return a ? normalizeAuthor(a) : undefined;
          })(),
          year: extractFieldValue(block, 'year'),
          journal: extractFieldValue(block, 'journal'),
          booktitle: extractFieldValue(block, 'booktitle'),
          publisher: extractFieldValue(block, 'publisher'),
        };
        const list = byKey.get(e.key) ?? [];
        list.push(meta);
        byKey.set(e.key, list);
      }
    } catch {
      // ignore per-file failures
    }
  }

  return { byKey, builtAt: Date.now(), projectId };
}

async function getBibIndex(): Promise<BibIndex> {
  const projectId = getProjectIdFromPathname(window.location.pathname);
  if (indexCache && Date.now() - indexCache.builtAt < INDEX_TTL_MS && indexCache.projectId === projectId) {
    return indexCache;
  }
  indexCache = await buildBibIndex();
  return indexCache;
}

type CiteHit = {
  key: string;
  command: string;
  from: number;
  to: number;
};

function findCiteKeyAtPos(docText: string, absolutePos: number, baseOffset: number): CiteHit | null {
  // `docText` is a chunk; `absolutePos` is in full document coordinates.
  // `baseOffset` is the full-doc offset where docText starts.
  const relPos = absolutePos - baseOffset;
  if (relPos < 0 || relPos > docText.length) return null;

  const citeRegex =
    /\\(?<cmd>cite|citep|citet|citealt|citealp|nocite|citeauthor|citeyear)\*?\s*(?:\[[^\]]*])*\s*\{(?<keys>[^}]*)\}/g;

  let match: RegExpExecArray | null;
  while ((match = citeRegex.exec(docText)) != null) {
    const keys = (match.groups?.keys ?? match[2] ?? '') as string;
    const cmd = (match.groups?.cmd ?? match[1] ?? 'cite') as string;
    const matchIndex = match.index ?? 0;
    const braceIndex = docText.indexOf('{', matchIndex);
    if (braceIndex === -1) continue;

    // Ignore commented-out cite on the same line.
    const lineStart = docText.lastIndexOf('\n', matchIndex) + 1;
    const commentIdx = docText.indexOf('%', lineStart);
    if (commentIdx !== -1 && commentIdx < matchIndex) continue;

    const keysStart = braceIndex + 1;
    const keysEnd = keysStart + keys.length;
    if (relPos < keysStart || relPos > keysEnd) continue;

    // Parse key spans inside keys string
    let i = 0;
    while (i <= keys.length) {
      const segStart = i;
      let segEnd = keys.indexOf(',', i);
      if (segEnd === -1) segEnd = keys.length;
      const raw = keys.slice(segStart, segEnd);
      const trimmed = raw.trim();
      const leftTrim = raw.length - raw.replace(/^\s+/, '').length;
      const rightTrim = raw.length - raw.replace(/\s+$/, '').length;
      const keyFrom = keysStart + segStart + leftTrim;
      const keyTo = keysStart + segEnd - rightTrim;

      if (trimmed && relPos >= keyFrom && relPos <= keyTo) {
        const absFrom = baseOffset + keyFrom;
        const absTo = baseOffset + keyTo;
        return { key: trimmed, command: cmd, from: absFrom, to: absTo };
      }
      i = segEnd + 1;
    }
  }
  return null;
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
}

function tryAdoptGlobalCm6() {
  try {
    const global = (window as any).__ageafCm6Exports as Cm6ExportsLite | undefined;
    if (!global) return false;
    cm6 = global;
    return true;
  } catch {
    return false;
  }
}

function isClickInEditor(event: MouseEvent): boolean {
  const t = event.target as HTMLElement | null;
  if (!t) return false;
  return !!t.closest?.('.cm-content');
}

async function onEditorClick(view: any, event: MouseEvent) {
  if (!isClickInEditor(event)) return;
  const pos = (view as any).posAtCoords?.({ x: event.clientX, y: event.clientY });
  if (typeof pos !== 'number') return;

  // Only run in .tex docs (cheap heuristic).
  const fullText: string = view.state.doc.toString();
  const aroundFrom = Math.max(0, pos - 500);
  const aroundTo = Math.min(fullText.length, pos + 500);
  const chunk = fullText.slice(aroundFrom, aroundTo);

  const hit = findCiteKeyAtPos(chunk, pos, aroundFrom);
  if (!hit) return;

  // Toggle off if clicking same key again quickly.
  const now = Date.now();
  if (popupFor && popupFor.key === hit.key && now - popupFor.at < 500) {
    closePopup();
    return;
  }
  popupFor = { key: hit.key, at: now };

  const idx = await getBibIndex();
  const list = idx.byKey.get(hit.key) ?? [];
  const best = list[0] ?? null;

  const coords = (view as any).coordsAtPos?.(pos);
  const left = (coords?.left ?? event.clientX) + 12;
  const top = (coords?.bottom ?? event.clientY) + 12;

  const citeText = `\\${hit.command}{${hit.key}}`;
  renderPopup(best, hit.key, citeText, { left, top });
}

function attachGlobalDismissHandlers() {
  // Close on outside click
  window.addEventListener(
    'click',
    () => {
      closePopup();
    },
    true
  );
  // Close on escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopup();
  });
  // Close on scroll (keeps it simple; avoids constant repositioning)
  window.addEventListener(
    'scroll',
    () => {
      closePopup();
    },
    true
  );
}

export function registerCitationKeyPopup() {
  ensureStyles();
  if (!installedViews) installedViews = new WeakSet<any>();
  attachGlobalDismissHandlers();

  tryAdoptGlobalCm6();

  window.addEventListener('UNSTABLE_editor:extensions', (ev) => {
    try {
      resolveCm6FromOverleafEvent(ev as OverleafExtensionsEvent);
    } catch {
      // ignore
    }
  });
  window.addEventListener('ageaf:cm6:resolved', () => {
    tryAdoptGlobalCm6();
  });

  // Poll for view changes and attach a click handler once per view.
  window.setInterval(() => {
    const view = safeGetCmView();
    if (!view) return;
    if (!cm6) return;

    if (!installedViews!.has(view)) {
      const now = Date.now();
      if (now - lastInstallAttemptAt < 250) return;
      lastInstallAttemptAt = now;

      try {
        const dom = (view as any).dom as HTMLElement | undefined;
        if (!dom) return;
        const handler = (ev: MouseEvent) => {
          void onEditorClick(view, ev);
        };
        dom.addEventListener('click', handler, true);
        // Store the handler so GC can release with the view; best-effort.
        (dom as any).__ageafCiteClickHandler = handler;
        installedViews!.add(view);
      } catch {
        // ignore
      }
    }
  }, 700);
}


