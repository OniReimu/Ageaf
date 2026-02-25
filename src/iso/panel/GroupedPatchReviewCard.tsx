import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { StoredPatchReview, StoredPatchReviewStatus } from './chatStore';
import { CloseIcon } from './ageaf-icons';
import { DiffReview } from './DiffReview';

export type HunkEntry = {
  messageId: string;
  patchReview: StoredPatchReview & { kind: 'replaceRangeInFile' };
  status: StoredPatchReviewStatus;
  error: string | null;
};

type GroupedPatchReviewCardProps = {
  filePath: string;
  hunks: HunkEntry[];
  busy: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onFeedback: (messageId: string) => void;
  isLightMode?: boolean;
};

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

function getHiddenLineCount(previous: HunkEntry, next: HunkEntry): number | null {
  const previousLineFrom = previous.patchReview.lineFrom;
  const nextLineFrom = next.patchReview.lineFrom;
  if (
    typeof previousLineFrom !== 'number' ||
    typeof nextLineFrom !== 'number' ||
    !Number.isFinite(previousLineFrom) ||
    !Number.isFinite(nextLineFrom)
  ) {
    return null;
  }

  const oldText = previous.patchReview.expectedOldText ?? '';
  const rawLineCount = oldText ? oldText.split('\n').length : 0;
  const previousOldLineCount =
    rawLineCount > 0 && oldText.endsWith('\n') ? rawLineCount - 1 : rawLineCount;
  const hidden = nextLineFrom - (previousLineFrom + previousOldLineCount);
  return hidden >= 0 ? hidden : 0;
}

function getStatusClass(status: StoredPatchReviewStatus) {
  if (status === 'accepted') return 'is-accepted';
  if (status === 'rejected') return 'is-rejected';
  return 'is-pending';
}

export function GroupedPatchReviewCard({
  filePath,
  hunks,
  busy,
  onAcceptAll,
  onRejectAll,
  onFeedback,
  isLightMode,
}: GroupedPatchReviewCardProps) {
  const shouldAnimateRef = useRef(true);
  const [collapsed, setCollapsed] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalPos, setModalPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    shouldAnimateRef.current = false;
  }, []);

  useEffect(() => {
    if (!showModal) {
      setModalPos(null);
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showModal]);

  useEffect(() => {
    if (!dragRef.current) return;
    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setModalPos({
        x: drag.origX + (event.clientX - drag.startX),
        y: drag.origY + (event.clientY - drag.startY),
      });
    };
    const onMouseUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });

  const sortedHunks = useMemo(() => {
    const copy = [...hunks];
    copy.sort((a, b) => {
      const aLineFrom = a.patchReview.lineFrom ?? Number.POSITIVE_INFINITY;
      const bLineFrom = b.patchReview.lineFrom ?? Number.POSITIVE_INFINITY;
      if (aLineFrom !== bLineFrom) return aLineFrom - bLineFrom;
      const aFrom = a.patchReview.from ?? Number.POSITIVE_INFINITY;
      const bFrom = b.patchReview.from ?? Number.POSITIVE_INFINITY;
      if (aFrom !== bFrom) return aFrom - bFrom;
      return a.messageId.localeCompare(b.messageId);
    });
    return copy;
  }, [hunks]);

  const { pendingCount, acceptedCount, rejectedCount } = useMemo(() => {
    let pending = 0;
    let accepted = 0;
    let rejected = 0;
    for (const hunk of sortedHunks) {
      if (hunk.status === 'pending') {
        pending += 1;
      } else if (hunk.status === 'accepted') {
        accepted += 1;
      } else {
        rejected += 1;
      }
    }
    return {
      pendingCount: pending,
      acceptedCount: accepted,
      rejectedCount: rejected,
    };
  }, [sortedHunks]);

  if (sortedHunks.length === 0) return null;

  let title = 'Review changes';
  if (pendingCount === 0 && sortedHunks.length > 0) {
    if (acceptedCount === sortedHunks.length) {
      title = 'Review changes · Accepted';
    } else if (rejectedCount === sortedHunks.length) {
      title = 'Review changes · Rejected';
    } else {
      title = 'Review changes · Mixed';
    }
  }

  const renderHunk = (
    hunk: HunkEntry,
    index: number,
    options: { animate: boolean; wrap?: boolean; feedback: boolean }
  ) => {
    const previous = index > 0 ? sortedHunks[index - 1] : null;
    const hiddenLineCount =
      previous != null ? getHiddenLineCount(previous, hunk) : null;
    const separatorLabel =
      hiddenLineCount == null
        ? 'unchanged lines hidden'
        : `${hiddenLineCount} unchanged lines hidden`;

    return (
      <div class="ageaf-grouped-patch__hunk" key={`${hunk.messageId}-${options.wrap ? 'modal' : 'inline'}`}>
        {previous ? (
          <div class="ageaf-grouped-patch__separator">{separatorLabel}</div>
        ) : null}
        <div class="ageaf-grouped-patch__hunk-header">
          <span
            class={`ageaf-file-summary__status-dot ${getStatusClass(hunk.status)}`}
          />
          <span class="ageaf-grouped-patch__hunk-status">
            {hunk.status === 'pending'
              ? 'Pending'
              : hunk.status === 'accepted'
                ? 'Accepted'
                : 'Rejected'}
          </span>
          {options.feedback && hunk.status === 'pending' ? (
            <button
              class="ageaf-panel__apply is-secondary"
              type="button"
              disabled={busy}
              onClick={() => onFeedback(hunk.messageId)}
              aria-label="Provide feedback on this change"
            >
              Feedback
            </button>
          ) : null}
        </div>
        {hunk.error && !options.wrap ? (
          <div class="ageaf-patch-review__warning">
            <span>{hunk.error}</span>
          </div>
        ) : null}
        <DiffReview
          oldText={hunk.patchReview.expectedOldText}
          newText={hunk.patchReview.text}
          fileName={hunk.patchReview.filePath}
          animate={options.animate}
          wrap={options.wrap}
          startLineNumber={hunk.patchReview.lineFrom}
          isLightMode={isLightMode}
        />
      </div>
    );
  };

  return (
    <div class="ageaf-patch-review ageaf-grouped-patch">
      <div class="ageaf-patch-review__header">
        <div class="ageaf-patch-review__title">
          {title}
          <span> · {filePath}</span>
          {pendingCount > 0 ? (
            <span class="ageaf-grouped-patch__pending"> · {pendingCount} pending</span>
          ) : null}
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
          {pendingCount > 0 ? (
            <>
              <button
                class="ageaf-panel__apply"
                type="button"
                disabled={busy}
                onClick={onAcceptAll}
                title="Accept all changes in this file"
                aria-label="Accept all changes in this file"
              >
                ✓
              </button>
              <button
                class="ageaf-panel__apply is-secondary"
                type="button"
                disabled={busy}
                onClick={onRejectAll}
                title="Reject all changes in this file"
                aria-label="Reject all changes in this file"
              >
                ✕
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div class={`ageaf-patch-review__diff-wrap${collapsed ? ' is-collapsed' : ''}`}>
        {sortedHunks.map((hunk, index) =>
          renderHunk(hunk, index, {
            animate: shouldAnimateRef.current,
            feedback: true,
          })
        )}
        {collapsed ? (
          <button
            class="ageaf-patch-review__toggle"
            type="button"
            onClick={() => {
              setCollapsed(false);
            }}
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
            onClick={(event) => event.stopPropagation()}
            style={modalPos ? { transform: `translate(${modalPos.x}px, ${modalPos.y}px)` } : undefined}
          >
            <div
              class="ageaf-diff-modal__header"
              onMouseDown={(event: MouseEvent) => {
                if ((event.target as HTMLElement).closest('button')) return;
                dragRef.current = {
                  startX: event.clientX,
                  startY: event.clientY,
                  origX: modalPos?.x ?? 0,
                  origY: modalPos?.y ?? 0,
                };
              }}
            >
              <div class="ageaf-diff-modal__title">
                {title}
                <span> · {filePath}</span>
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
              <div class="ageaf-grouped-patch__modal-list">
                {sortedHunks.map((hunk, index) =>
                  renderHunk(hunk, index, {
                    animate: false,
                    wrap: true,
                    feedback: false,
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
