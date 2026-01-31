import { useEffect, useRef } from 'preact/hooks';
import { preloadDiffHTML } from '@pierre/diffs/ssr';
import { ResolvedThemes, parseDiffFromFile, setLanguageOverride } from '@pierre/diffs';
import githubDark from '@shikijs/themes/github-dark';
import { diffLines } from 'diff';
import { startTypingReveal } from './typingReveal';

type Props = {
  oldText: string;
  newText: string;
  fileName?: string;
  animate?: boolean;
};

if (!ResolvedThemes.has('github-dark')) {
  ResolvedThemes.set('github-dark', githubDark);
}

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

export function DiffReview({ oldText, newText, fileName = 'selection.tex', animate = true }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const renderSeqRef = useRef(0);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const isSame = oldText === newText;
    const currentRender = renderSeqRef.current + 1;
    renderSeqRef.current = currentRender;
    let cancelled = false;
    let typingController: { cancel: () => void } | null = null;

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
            theme: 'github-dark',
            themeType: 'dark',
            diffStyle: 'unified',
            overflow: 'scroll',
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
            typingController?.cancel();
            typingController = startTypingReveal(wrapper);
          }
          return;
        }

        statusEl.remove();
        const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
        shadowRoot.innerHTML = html;
        if (animate) {
          typingController?.cancel();
          typingController = startTypingReveal(shadowRoot);
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
          typingController?.cancel();
          typingController = startTypingReveal(wrapperNow);
        }
      }
    })();

    return () => {
      cancelled = true;
      typingController?.cancel();
    };
  }, [oldText, newText, fileName]);

  return <div class="ageaf-diff-review" ref={wrapperRef} />;
}
