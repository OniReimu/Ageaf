import { useEffect, useRef } from 'preact/hooks';
import { preloadDiffHTML } from '@pierre/diffs/ssr';
import { ResolvedThemes, parseDiffFromFile, setLanguageOverride } from '@pierre/diffs';
import githubDark from '@shikijs/themes/github-dark';
// @ts-ignore: TS module resolution missing from package
import githubLight from '@shikijs/themes/github-light';
import { diffLines } from 'diff';
import { startTypingReveal, type TypingRevealController } from './typingReveal';
import { copyToClipboard } from './clipboard';

type Props = {
  oldText: string;
  newText: string;
  fileName?: string;
  animate?: boolean;
  wrap?: boolean;
  startLineNumber?: number;
  isLightMode?: boolean;
};

if (!ResolvedThemes.has('github-dark')) {
  ResolvedThemes.set('github-dark', githubDark as any);
}
if (!ResolvedThemes.has('github-light')) {
  ResolvedThemes.set('github-light', githubLight as any);
}

const SHADOW_OVERRIDES_STYLE_ID = 'ageaf-diff-shadow-overrides';

function formatElapsed(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

function injectShadowOverrides(shadowRoot: ShadowRoot, options: { wrap: boolean }) {
  const existing = shadowRoot.querySelector(`style#${SHADOW_OVERRIDES_STYLE_ID}`) as HTMLStyleElement | null;
  const style = existing ?? document.createElement('style');
  style.id = SHADOW_OVERRIDES_STYLE_ID;
  style.textContent = `
    /* Ageaf overrides for @pierre/diffs Shadow DOM */
    .shiki {
      background: transparent !important;
    }

    ${options.wrap ? `
      /* In wrap mode, keep the library's layout/backgrounds and only reserve
         space for the per-hunk copy button to the left of the line number. */
      [data-column-number] {
        position: relative !important;
        padding-left: 32px !important;
      }

      /* Tighten the gap between number and content a bit. */
      [data-column-content] {
        padding-inline-start: 0.5ch !important;
      }
    ` : `
      /* Non-wrap mode: keep the library's grid layout (so consecutive lines don't
         develop seams), but force the content column to paint a full-width
         background even when the text is shorter than the viewport. */
      [data-line-type="change-addition"] [data-column-content],
      [data-line-type="addition"] [data-column-content] {
        background: rgba(57, 185, 138, 0.14) !important;
        display: block !important;
        width: max-content !important;
        min-width: 100% !important;
      }

      [data-line-type="change-deletion"] [data-column-content],
      [data-line-type="deletion"] [data-column-content] {
        background: rgba(239, 68, 68, 0.12) !important;
        display: block !important;
        width: max-content !important;
        min-width: 100% !important;
      }

      [data-line-type="change-addition"] [data-column-number],
      [data-line-type="addition"] [data-column-number] {
        background: rgba(57, 185, 138, 0.08) !important;
      }

      [data-line-type="change-deletion"] [data-column-number],
      [data-line-type="deletion"] [data-column-number] {
        background: rgba(239, 68, 68, 0.06) !important;
      }
    `}

    /* Hide expand controls; keep the info line for readability. */
    [data-separator="line-info"] [data-expand-button] { display: none !important; }

    [data-separator="line-info"] {
      opacity: 0.85;
      user-select: none;
    }

    [data-separator="line-info"] [data-separator-content] {
      font-style: italic;
      opacity: 0.85;
    }

    /* Tiny copy button in added regions (superscript-ish). */
    .ageaf-diff-copy-btn {
      all: unset;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 3px 5px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.10);
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s ease, background 0.15s ease;
      z-index: 10;
    }

    [data-line-type="change-addition"]:hover .ageaf-diff-copy-btn,
    [data-line-type="addition"]:hover .ageaf-diff-copy-btn { opacity: 0.7; }
    .ageaf-diff-copy-btn:hover { opacity: 1 !important; background: rgba(255, 255, 255, 0.15); }

    .ageaf-diff-copy-btn.is-copied { opacity: 1; background: rgba(46, 160, 67, 0.20); }
    .ageaf-diff-copy-btn.is-failed { opacity: 1; background: rgba(220, 38, 38, 0.20); }

    .ageaf-diff-copy-btn .ageaf-diff-copy-btn__icon-check { display: none; }
    .ageaf-diff-copy-btn.is-copied .ageaf-diff-copy-btn__icon-copy { display: none; }
    .ageaf-diff-copy-btn.is-copied .ageaf-diff-copy-btn__icon-check { display: inline; }

    /* Optional word-wrap (used in the expand modal). */
  `;
  if (!existing) shadowRoot.appendChild(style);
}

function normalizeCollapsedUnchangedIndicators(shadowRoot: ShadowRoot) {
  shadowRoot.querySelectorAll('[data-unmodified-lines]').forEach((label) => {
    const raw = (label.textContent ?? '').trim();
    const match = raw.match(/(\d+)/);
    if (!match) return;
    label.textContent = `— ${match[1]} unchanged lines hidden —`;
  });
}

function adjustLineNumbers(shadowRoot: ShadowRoot, startLineNumber: number) {
  if (!startLineNumber || startLineNumber <= 0) return;

  // Find all line number elements - the library uses [data-line-number-content] or direct text in [data-column-number]
  const lineNumberElements = shadowRoot.querySelectorAll('[data-column-number]');

  lineNumberElements.forEach((el) => {
    // Try to find [data-line-number-content] first, then fall back to the column element itself
    const lineNumberContent = el.querySelector('[data-line-number-content]') as HTMLElement | null;
    const target = lineNumberContent ?? (el as HTMLElement);

    if (!target) return;

    // Get the text content - might be in a child node or directly in the element
    let text = target.textContent?.trim() ?? '';

    // If empty, try to find text in child nodes
    if (!text) {
      const textNode = Array.from(target.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      );
      text = textNode?.textContent?.trim() ?? '';
    }

    if (!text) return;

    // Parse line numbers - could be "123" or "123-456" for ranges, or might have whitespace
    const match = text.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) return;

    const start = Number.parseInt(match[1], 10);
    const end = match[2] ? Number.parseInt(match[2], 10) : null;

    if (!Number.isFinite(start) || start <= 0) return;

    // Adjust by adding the offset (subtract 1 because the diff starts at line 1, but we want to add the offset)
    const adjustedStart = start + startLineNumber - 1;
    const adjustedEnd = end ? end + startLineNumber - 1 : null;

    // Update the display
    const newText = adjustedEnd ? `${adjustedStart}-${adjustedEnd}` : String(adjustedStart);

    if (lineNumberContent) {
      lineNumberContent.textContent = newText;
    } else {
      // Replace the text node if it exists, otherwise set textContent
      const textNode = Array.from(target.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      );
      if (textNode) {
        textNode.textContent = newText;
      } else {
        target.textContent = newText;
      }
    }
  });
}

function getLineContent(line: Element) {
  const column = line.querySelector('[data-column-content]') as HTMLElement | null;
  const text = (column?.textContent ?? line.textContent ?? '').replace(/\u00A0/g, ' ');
  return text;
}

function getColumnContent(line: Element) {
  return line.querySelector('[data-column-content]') as HTMLElement | null;
}

function getColumnNumber(line: Element) {
  return line.querySelector('[data-column-number]') as HTMLElement | null;
}

function injectCopyButtons(shadowRoot: ShadowRoot) {
  let lines = shadowRoot.querySelectorAll('[data-line-type="change-addition"]');
  if (lines.length === 0) {
    // Back-compat for older diffs renderers.
    lines = shadowRoot.querySelectorAll('[data-line-type="addition"]');
  }
  if (lines.length === 0) return;

  // Group contiguous added lines into segments.
  // We group by DOM adjacency so we don't accidentally bridge across context/deletions.
  const segments: HTMLElement[][] = [];
  let currentSegment: HTMLElement[] = [];
  Array.from(lines).forEach((node) => {
    const line = node as HTMLElement;
    if (currentSegment.length === 0) {
      currentSegment.push(line);
      return;
    }
    const prev = currentSegment[currentSegment.length - 1];
    const isAdjacent = line.previousElementSibling === prev;
    if (isAdjacent) {
      currentSegment.push(line);
      return;
    }
    segments.push(currentSegment);
    currentSegment = [line];
  });
  if (currentSegment.length > 0) segments.push(currentSegment);

  // Inject copy button for each segment.
  for (const segment of segments) {
    const firstLine = segment[0];
    if (!firstLine) continue;
    const host = getColumnNumber(firstLine) ?? getColumnContent(firstLine) ?? firstLine;
    if (host.querySelector('.ageaf-diff-copy-btn')) continue;

    const text = segment
      .map((line) => getLineContent(line))
      .join('\n')
      .trimEnd();
    if (!text.trim()) continue;

    const button = document.createElement('button');
    button.className = 'ageaf-diff-copy-btn';
    button.type = 'button';
    button.innerHTML = `
      <svg class="ageaf-diff-copy-btn__icon-copy" viewBox="0 0 16 16" width="12" height="12">
        <path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>
        <path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
      </svg>
      <svg class="ageaf-diff-copy-btn__icon-check" viewBox="0 0 16 16" width="12" height="12">
        <path fill="currentColor" d="M6.5 11.2 3.8 8.5l-1 1 3.7 3.7L14.2 5.5l-1-1z"/>
      </svg>
    `;
    button.title = 'Copy proposed text';

    host.style.position = 'relative';
    button.style.position = 'absolute';
    button.style.top = '4px';
    button.style.left = '4px';

    let timeoutId: number | null = null;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        const ok = await copyToClipboard(text);
        button.classList.toggle('is-copied', ok);
        button.classList.toggle('is-failed', !ok);

        if (timeoutId) window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          button.classList.remove('is-copied');
          button.classList.remove('is-failed');
        }, 3000);
      })();
    });

    host.appendChild(button);
  }
}

function renderFallback(
  wrapper: HTMLElement,
  input: { oldText: string; newText: string; title: string }
) {
  wrapper.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'ageaf-diff-review__fallback';

  const title = document.createElement('div');
  title.className = 'ageaf-diff-review__fallback-title';
  title.textContent = input.title;
  container.appendChild(title);

  const diffLabel = document.createElement('div');
  diffLabel.className = 'ageaf-diff-review__fallback-label';
  diffLabel.textContent = 'Diff (fallback)';
  container.appendChild(diffLabel);

  const diffBox = document.createElement('div');
  diffBox.className = 'ageaf-diff-review__fallback-diff';

  for (const change of diffLines(input.oldText, input.newText)) {
    const prefix = change.added ? '+' : change.removed ? '-' : ' ';
    const className = change.added
      ? 'ageaf-diff-review__fallback-diff-line is-added'
      : change.removed
        ? 'ageaf-diff-review__fallback-diff-line is-removed'
        : 'ageaf-diff-review__fallback-diff-line';
    const rawLines = change.value.split('\n');
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (i === rawLines.length - 1 && line === '') break;
      const lineEl = document.createElement('div');
      lineEl.className = className;
      lineEl.textContent = `${prefix}${line}`;
      diffBox.appendChild(lineEl);
    }
  }

  container.appendChild(diffBox);

  const oldLabel = document.createElement('div');
  oldLabel.className = 'ageaf-diff-review__fallback-label';
  oldLabel.textContent = 'Current text';
  container.appendChild(oldLabel);

  const oldPre = document.createElement('pre');
  oldPre.className = 'ageaf-diff-review__fallback-code';
  oldPre.textContent = input.oldText;
  container.appendChild(oldPre);

  const newLabel = document.createElement('div');
  newLabel.className = 'ageaf-diff-review__fallback-label';
  newLabel.textContent = 'Proposed text';
  container.appendChild(newLabel);

  const newPre = document.createElement('pre');
  newPre.className = 'ageaf-diff-review__fallback-code';
  newPre.textContent = input.newText;
  container.appendChild(newPre);

  wrapper.appendChild(container);
}

export function DiffReview({
  oldText,
  newText,
  fileName = 'selection.tex',
  animate = true,
  wrap = false,
  startLineNumber,
  isLightMode = false,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const renderSeqRef = useRef(0);
  const typingControllerRef = useRef<TypingRevealController | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const isSame = oldText === newText;
    const currentRender = renderSeqRef.current + 1;
    renderSeqRef.current = currentRender;
    let cancelled = false;
    typingControllerRef.current?.cancel();
    typingControllerRef.current = null;

    void (async () => {
      const startedAt = Date.now();
      // Show a lightweight progress line immediately so the UI doesn't feel stuck.
      wrapper.innerHTML = '';
      const statusEl = document.createElement('div');
      statusEl.className = 'ageaf-diff-review__status';
      statusEl.textContent = `Rendering diff · ${formatElapsed(0)}`;
      wrapper.appendChild(statusEl);

      const host = document.createElement('div');
      host.className = 'ageaf-diff-review__host';
      wrapper.appendChild(host);

      const tickId = window.setInterval(() => {
        if (cancelled || renderSeqRef.current !== currentRender) {
          window.clearInterval(tickId);
          return;
        }
        const elapsed = (Date.now() - startedAt) / 1000;
        statusEl.textContent = `Rendering diff · ${formatElapsed(elapsed)}`;
      }, 250);

      try {
        const fileDiff = setLanguageOverride(
          parseDiffFromFile(
            { name: fileName, contents: oldText },
            { name: fileName, contents: newText }
          ),
          'text'
        );

        const html = await preloadDiffHTML({
          fileDiff,
          options: {
            theme: isLightMode ? 'github-light' : 'github-dark',
            themeType: isLightMode ? 'light' : 'dark',
            diffStyle: 'unified',
            overflow: wrap ? 'wrap' : 'scroll',
            expandUnchanged: false,
            expansionLineCount: 3,
          },
        });

        window.clearInterval(tickId);
        if (cancelled || renderSeqRef.current !== currentRender) return;

        // `data-diffs` appears in the embedded CSS too; ensure we have the actual container.
        if (!html || !html.includes('data-diffs=\"\"')) {
          renderFallback(wrapper, {
            title: isSame ? 'No changes' : 'Diff unavailable',
            oldText,
            newText,
          });
          if (animate) {
            typingControllerRef.current?.cancel();
            typingControllerRef.current = startTypingReveal(wrapper);
          }
          return;
        }

        statusEl.remove();
        const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
        shadowRoot.innerHTML = html;

        injectShadowOverrides(shadowRoot, { wrap });
        normalizeCollapsedUnchangedIndicators(shadowRoot);

        // Adjust line numbers to show absolute line numbers from the file
        if (startLineNumber) {
          adjustLineNumbers(shadowRoot, startLineNumber);
        }

        // Inject copy buttons on added line segments (modal only).
        if (wrap) {
          injectCopyButtons(shadowRoot);
        }

        if (animate) {
          typingControllerRef.current?.cancel();
          typingControllerRef.current = startTypingReveal(shadowRoot);
        }
      } catch (error) {
        window.clearInterval(tickId);
        console.error('[Ageaf] Diff render failed', error);
        const wrapperNow = wrapperRef.current;
        if (!wrapperNow) return;
        if (cancelled || renderSeqRef.current !== currentRender) return;
        renderFallback(wrapperNow, {
          title: oldText === newText ? 'No changes' : 'Diff unavailable',
          oldText,
          newText,
        });
        if (animate) {
          typingControllerRef.current?.cancel();
          typingControllerRef.current = startTypingReveal(wrapperNow);
        }
      }
    })();

    return () => {
      cancelled = true;
      typingControllerRef.current?.cancel();
      typingControllerRef.current = null;
    };
  }, [oldText, newText, fileName, startLineNumber, animate, wrap, isLightMode]);

  return <div class="ageaf-diff-review" ref={wrapperRef} />;
}
