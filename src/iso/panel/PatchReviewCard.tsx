import { useEffect, useRef, useState } from 'preact/hooks';
import { StoredPatchReview } from './chatStore';
import { copyToClipboard } from './clipboard';
import { CloseIcon } from './ageaf-icons';
import { DiffReview } from './DiffReview';

export type Message = {
  id: string;
  role: 'system' | 'assistant' | 'user';
  content: string;
};

export const CopyIcon = () => (
  <svg
    class="ageaf-message__copy-icon"
    viewBox="0 0 20 20"
    aria-hidden="true"
    focusable="false"
  >
    <rect
      x="6.5"
      y="3.5"
      width="10"
      height="12"
      rx="2"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
    />
    <rect
      x="3.5"
      y="6.5"
      width="10"
      height="12"
      rx="2"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
    />
  </svg>
);

export const CheckIcon = () => (
  <svg
    class="ageaf-message__copy-check"
    viewBox="0 0 20 20"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M5 10.5l3.2 3.2L15 7.2"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

const ExpandIcon = () => (
  <svg
    class="ageaf-patch-review__expand-icon"
    viewBox="0 0 20 20"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M3 3h7M17 3v7M17 17h-7M3 17v-7M12 8l5-5m0 0h-5m5 0v5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

type PatchReviewCardProps = {
  message: Message;
  patchReview: StoredPatchReview;
  status: 'pending' | 'accepted' | 'rejected';
  error: string | null;
  busy: boolean;
  canAct: boolean;
  copied: boolean;
  onCopy: () => void;
  onAccept: () => void;
  onFeedback: () => void;
  onReject: () => void;
  markAnimated: () => void;
  isLightMode?: boolean;
};

export function PatchReviewCard({
  message,
  patchReview,
  status,
  error,
  busy,
  canAct,
  copied,
  onCopy,
  onAccept,
  onFeedback,
  onReject,
  markAnimated,
  isLightMode,
}: PatchReviewCardProps) {
  // One-off: animate only the very first time this card is created.
  // Persist a flag so refreshes / subsequent renders do not animate.
  const shouldAnimateRef = useRef<boolean>(!(patchReview as any).hasAnimated);
  const [collapsed, setCollapsed] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [headerCopied, setHeaderCopied] = useState(false);
  const headerCopyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldAnimateRef.current) return;
    markAnimated();
  }, []);

  useEffect(() => {
    return () => {
      if (headerCopyTimerRef.current != null) {
        window.clearTimeout(headerCopyTimerRef.current);
        headerCopyTimerRef.current = null;
      }
    };
  }, []);

  // ESC key handler for modal
  useEffect(() => {
    if (!showModal) return;
    setModalOffset({ x: 0, y: 0 });
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const startModalDrag = (event: MouseEvent) => {
    // Only left-click dragging.
    if ((event as any).button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = { ...modalOffset };

    const onMove = (e: MouseEvent) => {
      setModalOffset({
        x: startOffset.x + (e.clientX - startX),
        y: startOffset.y + (e.clientY - startY),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  let fileLabel: string | null = null;
  if (patchReview.kind === 'replaceRangeInFile') {
    fileLabel = patchReview.filePath;
  } else if (patchReview.kind === 'replaceSelection') {
    fileLabel = patchReview.fileName ?? 'selection.tex';
  }

  let title = 'Review changes';
  if (status === 'accepted') {
    title = 'Review changes · Accepted';
  } else if (status === 'rejected') {
    title = 'Review changes · Rejected';
  }

  const startLineNumber =
    (patchReview.kind === 'replaceSelection' || patchReview.kind === 'replaceRangeInFile')
      ? patchReview.lineFrom
      : undefined;

  return (
    <div class="ageaf-patch-review">
      <div class="ageaf-patch-review__header">
        <div class="ageaf-patch-review__title">
          {title}
          {fileLabel ? <span> · {fileLabel}</span> : null}
        </div>
        <div class="ageaf-patch-review__actions">
          <button
            class="ageaf-patch-review__expand-btn"
            type="button"
            onClick={() => setShowModal(true)}
            title="Expand diff"
            aria-label="Expand diff to full screen"
          >
            <ExpandIcon />
          </button>
          <button
            class="ageaf-patch-review__expand-btn"
            type="button"
            onClick={() => {
              void (async () => {
                const ok = await copyToClipboard(
                  (patchReview as any).text ?? ''
                );
                if (!ok) return;
                setHeaderCopied(true);
                if (headerCopyTimerRef.current != null) {
                  window.clearTimeout(headerCopyTimerRef.current);
                }
                headerCopyTimerRef.current = window.setTimeout(() => {
                  setHeaderCopied(false);
                  headerCopyTimerRef.current = null;
                }, 3000);
              })();
            }}
            title="Copy proposed text"
            aria-label="Copy proposed text"
          >
            {headerCopied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {status === 'pending' ? (
            <>
              <button
                class="ageaf-panel__apply"
                type="button"
                disabled={!canAct || Boolean(error)}
                onClick={onAccept}
                title="Accept"
                aria-label="Accept"
              >
                ✓
              </button>
              <button
                class="ageaf-panel__apply is-secondary"
                type="button"
                disabled={busy}
                onClick={onReject}
                title="Reject"
                aria-label="Reject"
              >
                ✕
              </button>
              <button
                class="ageaf-panel__apply is-secondary"
                type="button"
                disabled={busy}
                onClick={onFeedback}
                aria-label="Provide feedback on this change"
              >
                Feedback
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div class="ageaf-patch-review__warning">
          <span>{error}</span>
          <button
            class="ageaf-panel__apply is-secondary"
            type="button"
            onClick={onCopy}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span>Copy proposed text</span>
          </button>
        </div>
      ) : null}

      <div class={`ageaf-patch-review__diff-wrap${collapsed ? ' is-collapsed' : ''}`}>
        {patchReview.kind === 'replaceRangeInFile' ? (
          <DiffReview
            oldText={patchReview.expectedOldText}
            newText={patchReview.text}
            fileName={patchReview.filePath}
            animate={shouldAnimateRef.current}
            startLineNumber={startLineNumber}
            isLightMode={isLightMode}
          />
        ) : patchReview.kind === 'replaceSelection' ? (
          <DiffReview
            oldText={patchReview.selection}
            newText={patchReview.text}
            fileName={patchReview.fileName ?? undefined}
            animate={shouldAnimateRef.current}
            startLineNumber={startLineNumber}
            isLightMode={isLightMode}
          />
        ) : null}
        {collapsed ? (
          <button
            class="ageaf-patch-review__toggle"
            type="button"
            onClick={() => setCollapsed(false)}
          >
            Show more
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <button
          class="ageaf-patch-review__toggle"
          type="button"
          onClick={() => setCollapsed(true)}
        >
          Show less
        </button>
      ) : null}

      {showModal ? (
        <div class="ageaf-diff-modal__backdrop">
          <div
            class="ageaf-diff-modal"
            style={{
              transform: `translate(${modalOffset.x}px, ${modalOffset.y}px)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              class="ageaf-diff-modal__header"
              onMouseDown={(e) => startModalDrag(e as any)}
            >
              <div class="ageaf-diff-modal__title">
                {title}
                {fileLabel ? <span> · {fileLabel}</span> : null}
                <span class="ageaf-diff-modal__shortcut-hint">ESC to close</span>
              </div>
              <button
                class="ageaf-diff-modal__close"
                type="button"
                onClick={() => setShowModal(false)}
                title="Close (ESC)"
                aria-label="Close diff modal"
              >
                <CloseIcon />
              </button>
            </div>
            <div class="ageaf-diff-modal__content">
              {patchReview.kind === 'replaceRangeInFile' ? (
                <DiffReview
                  oldText={patchReview.expectedOldText}
                  newText={patchReview.text}
                  fileName={patchReview.filePath}
                  animate={false}
                  wrap={true}
                  startLineNumber={startLineNumber}
                />
              ) : patchReview.kind === 'replaceSelection' ? (
                <DiffReview
                  oldText={patchReview.selection}
                  newText={patchReview.text}
                  fileName={patchReview.fileName ?? undefined}
                  animate={false}
                  wrap={true}
                  startLineNumber={startLineNumber}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
