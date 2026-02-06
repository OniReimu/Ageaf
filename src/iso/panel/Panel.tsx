import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import morphdom from 'morphdom';
import {
  expandLatexIncludes,
  type ProjectFile,
} from './latexExpand';

import {
  createJob,
  deleteSession,
  fetchClaudeRuntimeContextUsage,
  fetchClaudeRuntimeMetadata,
  fetchCodexRuntimeContextUsage,
  fetchCodexRuntimeMetadata,
  fetchHostHealth,
  fetchHostToolsStatus,
  openAttachmentDialog,
  respondToJobRequest,
  setHostToolsEnabled,
  streamJobEvents,
  updateClaudeRuntimePreferences,
  validateAttachmentEntries,
  type JobEvent,
  type AttachmentMeta,
} from '../api/client';
import type {
  NativeHostRequest,
  NativeHostResponse,
} from '../messaging/nativeProtocol';
import { getOptions } from '../../utils/helper';
import {
  LOCAL_STORAGE_KEY_INLINE_OVERLAY,
  LOCAL_STORAGE_KEY_OPTIONS,
} from '../../constants';
import { Options } from '../../types';
import { parseMarkdown, renderMarkdown } from './markdown';
import { DiffReview } from './DiffReview';
import {
  loadSkillsManifest,
  loadSkillMarkdown,
  searchSkills,
  type SkillEntry,
} from './skills/skillsRegistry';
import {
  ProviderId,
  StoredConversation,
  StoredContextUsage,
  StoredMessage,
  CoTItem,
  CoTThinkingItem,
  CoTToolItem,
  StoredPatchReview,
  StoredProjectChat,
  deleteConversation,
  ensureActiveConversation,
  getOverleafProjectIdFromPathname,
  loadProjectChat,
  saveProjectChat,
  setActiveConversation,
  setConversationCodexThreadId,
  setConversationContextUsage,
  setConversationMessages,
  startNewConversation,
} from './chatStore';

import './panel.css';
import 'katex/dist/katex.min.css';

import './ageaf-complete-redesign.css';

import './ageaf-toolbar-components.css';
import Icons from './ageaf-icons';
import {
  SettingsIcon,
  RewriteIcon,
  AttachFilesIcon,
  NewChatIconAlt,
  CloseSessionIcon,
  ClearChatIcon,
} from './ageaf-icons';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 560;
const DEFAULT_MODEL_VALUE = 'sonnet';
const DEFAULT_MODEL_LABEL = 'Sonnet';
const INTERRUPTED_BY_USER_MARKER = 'INTERRUPTED BY USER';
const DEBUG_DIFF = false;
const HOW_TO_GUIDES_URL = 'https://github.com/OniReimu/Ageaf/tree/main';
const EDITOR_OVERLAY_SHOW_EVENT = 'ageaf:editor:overlay:show';
const EDITOR_OVERLAY_CLEAR_EVENT = 'ageaf:editor:overlay:clear';
const EDITOR_OVERLAY_READY_EVENT = 'ageaf:editor:overlay:ready';
const PANEL_OVERLAY_ACTION_EVENT = 'ageaf:panel:patch-review-action';

function getIconUrl(path: string) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      const url = chrome.runtime.getURL(path);
      const version = chrome.runtime.getManifest?.()?.version ?? 'dev';
      return `${url}?v=${version}`;
    }
  } catch {
    // Extension context invalidated - fall back to relative path
  }
  return path;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripInterruptedByUserSuffix(text: string) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const marker = escapeRegExp(INTERRUPTED_BY_USER_MARKER);
  return normalized.replace(new RegExp(`\\n*${marker}\\s*$`), '').trimEnd();
}

/**
 * Helper to close any unclosed code fences in partial streaming text.
 * Returns the text with closing fences added if needed.
 */
function closeUnfinishedCodeFences(text: string): string {
  if (!text) return text;

  // Count code fence markers (```)
  const fenceMatches = text.match(/```/g);
  const fenceCount = fenceMatches ? fenceMatches.length : 0;

  // If odd number of fences, there's an unclosed code block
  if (fenceCount % 2 !== 0) {
    return text + '\n```';
  }

  return text;
}

const CopyIcon = () => (
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

const CheckIcon = () => (
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

const PatchReviewCard = ({
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
}: {
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
}) => {
  // One-off: animate only the very first time this card is created.
  // Persist a flag so refreshes / subsequent renders do not animate.
  const shouldAnimateRef = useRef<boolean>(!(patchReview as any).hasAnimated);
  const [showModal, setShowModal] = useState(false);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [headerCopied, setHeaderCopied] = useState(false);
  const headerCopyTimerRef = useRef<number | null>(null);

  const copyToClipboard = async (text: string) => {
    if (!text) return false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (error) {
          // Extension context invalidated - treat as a no-op.
          if (
            error instanceof Error &&
            error.message.includes('Extension context invalidated')
          ) {
            return false;
          }
          // fall through to legacy copy
        }
      }

      if (typeof document === 'undefined') return false;
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Extension context invalidated')
      ) {
        return false;
      }
      return false;
    }
  };

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

  const fileLabel =
    patchReview.kind === 'replaceRangeInFile'
      ? patchReview.filePath
      : patchReview.kind === 'replaceSelection'
        ? patchReview.fileName ?? 'selection.tex'
        : null;

  const title =
    status === 'accepted'
      ? 'Review changes · Accepted'
      : status === 'rejected'
        ? 'Review changes · Rejected'
        : 'Review changes';

  // Calculate starting line number for absolute line number display
  const calculateStartLineNumber = (): number | undefined => {
    if (patchReview.kind === 'replaceSelection') {
      // For replaceSelection, use lineFrom if available (this is the absolute line number)
      return patchReview.lineFrom;
    } else if (patchReview.kind === 'replaceRangeInFile') {
      // For replaceRangeInFile, the 'from' offset is relative to the full file, not the snippet.
      // We don't have the full file content here, so we can't calculate the absolute line number.
      // The diff library will show relative line numbers (1, 2, 3...) which is acceptable
      // since we're showing a snippet diff, not the full file diff.
      // If we need absolute line numbers for replaceRangeInFile, we'd need to pass
      // the starting line number from the host when creating the patch.
      return undefined;
    }
    return undefined;
  };

  const startLineNumber = calculateStartLineNumber();

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

      {patchReview.kind === 'replaceRangeInFile' ? (
        <DiffReview
          oldText={patchReview.expectedOldText}
          newText={patchReview.text}
          fileName={patchReview.filePath}
          animate={shouldAnimateRef.current}
          startLineNumber={startLineNumber}
        />
      ) : patchReview.kind === 'replaceSelection' ? (
        <DiffReview
          oldText={patchReview.selection}
          newText={patchReview.text}
          fileName={patchReview.fileName ?? undefined}
          animate={shouldAnimateRef.current}
          startLineNumber={startLineNumber}
        />
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
              </div>
              <button
                class="ageaf-diff-modal__close"
                type="button"
                onClick={() => setShowModal(false)}
                title="Close (ESC)"
              >
                ✕
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
};

const PROVIDER_DISPLAY = {
  claude: { label: 'Anthropic' },
  codex: { label: 'OpenAI' },
} as const;

const MODEL_DISPLAY = {
  opus: { label: 'Opus', description: 'Most capable for complex work' },
  sonnet: { label: 'Sonnet', description: 'Best for everyday task' },
  haiku: { label: 'Haiku', description: 'Fastest for quick answers' },
} as const;

type KnownModelToken = keyof typeof MODEL_DISPLAY;

const FALLBACK_THINKING_MODES: ThinkingMode[] = [
  { id: 'off', label: 'Off', maxThinkingTokens: null },
  { id: 'low', label: 'Low', maxThinkingTokens: 1024 },
  { id: 'medium', label: 'Med', maxThinkingTokens: 4096 },
  { id: 'high', label: 'High', maxThinkingTokens: 8192 },
  { id: 'ultra', label: 'Ultra', maxThinkingTokens: 16384 },
];

const CODEX_EFFORT_TO_THINKING_MODE: Record<string, ThinkingMode['id']> = {
  none: 'off',
  minimal: 'low',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'ultra',
};

function getThinkingModeIdForCodexEffort(
  effort: string | null | undefined
): ThinkingMode['id'] {
  const normalized = (effort ?? '').trim().toLowerCase();
  return CODEX_EFFORT_TO_THINKING_MODE[normalized] ?? 'off';
}

function getCodexEffortForThinkingMode(
  modeId: ThinkingMode['id'],
  model: RuntimeModel | null
) {
  const supported =
    model?.supportedReasoningEfforts?.map((entry) =>
      String(entry.reasoningEffort ?? '').trim()
    ) ?? [];
  const candidates =
    modeId === 'off'
      ? ['none']
      : modeId === 'ultra'
        ? ['xhigh']
        : modeId === 'low'
          ? ['low', 'minimal']
          : [modeId];
  for (const candidate of candidates) {
    if (supported.includes(candidate)) return candidate;
  }
  return null;
}

export function mountPanel(container?: HTMLElement) {
  if (document.getElementById('ageaf-panel-root')) {
    return;
  }

  const root = document.createElement('div');
  root.id = 'ageaf-panel-root';
  (container ?? document.body).appendChild(root);

  render(<Panel />, root);
}

export function unmountPanel() {
  const root = document.getElementById('ageaf-panel-root');
  if (!root) return;
  render(null, root);
  root.remove();
}

type Message = {
  id: string;
  role: 'system' | 'assistant' | 'user';
  content: string;
  statusLine?: string;
  cot?: CoTItem[];
  thinking?: string[];
  images?: ImageAttachment[];
  attachments?: FileAttachment[];
  patchReview?: StoredPatchReview;
};

type PatchFeedbackTarget = {
  conversationId: string;
  messageId: string;
  messageIndex: number;
  kind: 'replaceSelection' | 'replaceRangeInFile';
};

type QueuedMessage = {
  text: string;
  images?: ImageAttachment[];
  attachments?: FileAttachment[];
  patchFeedbackTarget?: PatchFeedbackTarget;
};

type JobAction = 'chat' | 'rewrite' | 'fix_error';

type Patch =
  | { kind: 'replaceSelection'; text: string }
  | { kind: 'insertAtCursor'; text: string }
  | {
    kind: 'replaceRangeInFile';
    filePath: string;
    expectedOldText: string;
    text: string;
    from?: number;
    to?: number;
  };

type SelectionSnapshot = {
  selection: string;
  from: number;
  to: number;
  lineFrom?: number;
  lineTo?: number;
  fileName?: string;
};

type ToolRequest = {
  kind: 'approval' | 'user_input';
  requestId: number | string;
  method: string;
  params: any;
};

type ToolInputOption = {
  label: string;
  description: string;
};

type ToolInputQuestion = {
  id: string;
  header: string;
  question: string;
  options: ToolInputOption[] | null;
};

type ChipPayload = {
  text: string;
  filename: string;
  lineCount: number;
  lineFrom?: number;
  lineTo?: number;
};

type ImageAttachment = {
  id: string;
  name: string;
  mediaType: string;
  data: string;
  size: number;
  source?: 'paste' | 'drop';
};

type FileAttachment = {
  id: string;
  path?: string;
  name: string;
  ext: string;
  sizeBytes: number;
  lineCount: number;
  mime?: string;
  content?: string;
};

type OverleafEntry = {
  path: string;
  name: string;
  ext: string;
  kind: 'tex' | 'bib' | 'img' | 'other' | 'folder';
  /**
   * Overleaf entity id when available (docs + file refs).
   * In the Overleaf file tree DOM, this is exposed via `data - file - id`.
   */
  id?: string;
  /**
   * Overleaf entity type when available (`doc` or `file`), exposed via `data - file - type`.
   */
  entityType?: 'doc' | 'file' | string;
};

type RuntimeModel = {
  value: string;
  displayName: string;
  description: string;
  supportedReasoningEfforts?: Array<{
    reasoningEffort: string;
    description: string;
  }>;
  defaultReasoningEffort?: string;
  isDefault?: boolean;
};

type ThinkingMode = {
  id: string;
  label: string;
  maxThinkingTokens: number | null;
};

type ContextUsage = {
  usedTokens: number;
  contextWindow: number | null;
  percentage?: number | null;
};

function normalizeContextUsage(input: {
  usedTokens: number;
  contextWindow: number | null;
  percentage?: number | null;
}): ContextUsage {
  let usedTokens = Number.isFinite(input.usedTokens)
    ? Math.max(0, input.usedTokens)
    : 0;
  const contextWindow =
    input.contextWindow &&
      Number.isFinite(input.contextWindow) &&
      input.contextWindow > 0
      ? input.contextWindow
      : null;

  if (contextWindow) {
    usedTokens = Math.min(usedTokens, contextWindow);
  }
  const percentage =
    contextWindow && contextWindow > 0
      ? Math.round((usedTokens / contextWindow) * 100)
      : null;

  return { usedTokens, contextWindow, percentage };
}

type HostToolsStatus = {
  toolsEnabled: boolean;
  toolsAvailable: boolean;
  remoteToggleAllowed: boolean;
};

type ConnectionHealth = {
  hostConnected: boolean;
  runtimeWorking: boolean;
};

const Panel = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [editorEmpty, setEditorEmpty] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatProvider, setChatProvider] = useState<ProviderId>('claude');
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [streamingCoT, setStreamingCoT] = useState<CoTItem[]>([]);
  const [patchActionBusyId, setPatchActionBusyId] = useState<string | null>(
    null
  );
  const [patchActionErrors, setPatchActionErrors] = useState<
    Record<string, string>
  >({});
  const pendingPatchFeedbackTargetRef = useRef<PatchFeedbackTarget | null>(
    null
  );
  const [toolRequests, setToolRequests] = useState<ToolRequest[]>([]);
  const [toolRequestInputs, setToolRequestInputs] = useState<
    Record<string, string>
  >({});
  const [toolRequestBusy, setToolRequestBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    'connection' | 'authentication' | 'tools' | 'customization' | 'safety'
  >('connection');
  const [settings, setSettings] = useState<Options | null>(null);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [hostToolsStatus, setHostToolsStatus] =
    useState<HostToolsStatus | null>(null);
  const [nativeStatus, setNativeStatus] = useState<
    'unknown' | 'available' | 'unavailable'
  >('unknown');
  const [nativeStatusError, setNativeStatusError] = useState<string | null>(
    null
  );
  const [isSending, setIsSending] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [isStreamingActive, setIsStreamingActive] = useState(false);

  const [runtimeModels, setRuntimeModels] = useState<RuntimeModel[]>([]);
  const [thinkingModes, setThinkingModes] = useState<ThinkingMode[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentThinkingMode, setCurrentThinkingMode] = useState('off');
  const [currentThinkingTokens, setCurrentThinkingTokens] = useState<
    number | null
  >(null);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [yoloMode, setYoloMode] = useState(true);
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({});
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>(
    []
  );
  const imageAttachmentsRef = useRef<ImageAttachment[]>([]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const fileAttachmentsRef = useRef<FileAttachment[]>([]);
  const overlayActiveDetailsRef = useRef<Map<string, string>>(new Map());
  const [projectFiles, setProjectFiles] = useState<OverleafEntry[]>([]);
  const projectFilesRef = useRef<OverleafEntry[]>([]);
  const selectionSnapshotsRef = useRef<Map<string, SelectionSnapshot>>(
    new Map()
  ); // jobId -> snapshot
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionResults, setMentionResults] = useState<OverleafEntry[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRangeRef = useRef<{
    node: Text;
    start: number;
    end: number;
  } | null>(null);
  const mentionListRef = useRef<HTMLDivElement | null>(null);
  const [skillOpen, setSkillOpen] = useState(false);
  const [skillResults, setSkillResults] = useState<SkillEntry[]>([]);
  const [skillIndex, setSkillIndex] = useState(0);
  const skillRangeRef = useRef<{
    node: Text;
    start: number;
    end: number;
  } | null>(null);
  const skillListRef = useRef<HTMLDivElement | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const attachmentErrorTimerRef = useRef<number | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const dropDepthRef = useRef(0);
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>({
    hostConnected: false,
    runtimeWorking: false,
  });

  // Ephemeral API keys (in-memory only, never persisted)
  const [claudeApiKey, setClaudeApiKey] = useState<string>('');
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('');
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Tool execution visibility tracking
  type ToolExecutionState = {
    toolId: string;
    toolName: string;
    phase: 'started' | 'completed' | 'failed';
    message: string;
    input?: string;
    timestamp: number;
  };
  const [activeTools, setActiveTools] = useState<
    Map<string, ToolExecutionState>
  >(new Map());
  const lastHostOkAtRef = useRef(0);
  const lastRuntimeOkAtRef = useRef(0);
  const lastCodexMetadataCheckAtRef = useRef(0);
  const metadataCacheRef = useRef<{
    claude?: {
      models: RuntimeModel[];
      thinkingModes: ThinkingMode[];
      fetchedAt: number;
    };
    codex?: {
      models: RuntimeModel[];
      thinkingModes: ThinkingMode[];
      fetchedAt: number;
    };
  }>({});

  // Per-session runtime state for async job handling
  type SessionRuntimeState = {
    // Job execution state
    isSending: boolean;
    activeJobId: string | null;
    abortController: AbortController | null;
    interrupted: boolean;
    didReceivePatch: boolean;

    // Message queue
    queue: Array<{
      text: string;
      images?: ImageAttachment[];
      attachments?: FileAttachment[];
      patchFeedbackTarget?: PatchFeedbackTarget;
      timestamp: number;
    }>;

    // Streaming state
    streamingText: string;
    streamTokens: string[];
    streamTimerId: number | null;

    // Thinking state
    thinkingTimerId: number | null;
    thinkingStartTime: number | null;
    thinkingComplete: boolean;

    // Activity tracking
    activityStartTime: number | null;
    lastActivity: number;

    // Pending completion
    pendingDone: { status: string; message?: string } | null;

    // Patch proposals received while streaming a reply
    pendingPatchReviewMessages: StoredMessage[];

    // Debug/trace (per in-flight message)
    debugCliEventsEnabled: boolean;

    // Thinking block tracking
    thinkingBuffer: string;
    inThinkingBlock: boolean;
    thinkingBlocks: string[];
    cotSequence: CoTItem[];

    // Streaming status prefix (plan/tool/trace) to display during thinking timer
    statusPrefix: string | null;
  };

  const sessionStates = useRef<Map<string, SessionRuntimeState>>(new Map());

  // Create initial session state
  const createInitialState = (): SessionRuntimeState => ({
    isSending: false,
    activeJobId: null,
    abortController: null,
    interrupted: false,
    didReceivePatch: false,
    queue: [],
    streamingText: '',
    streamTokens: [],
    streamTimerId: null,
    thinkingTimerId: null,
    thinkingStartTime: null,
    thinkingComplete: false,
    activityStartTime: null,
    lastActivity: Date.now(),
    pendingDone: null,
    pendingPatchReviewMessages: [],
    debugCliEventsEnabled: false,

    thinkingBuffer: '',
    inThinkingBlock: false,
    thinkingBlocks: [],
    cotSequence: [],

    statusPrefix: null,
  });

  // Get or create session state
  const getSessionState = (conversationId: string): SessionRuntimeState => {
    if (!sessionStates.current.has(conversationId)) {
      sessionStates.current.set(conversationId, createInitialState());
    }
    return sessionStates.current.get(conversationId)!;
  };

  // Extract <thinking> blocks from streaming text
  const extractThinkingBlocks = (
    deltaText: string,
    state: SessionRuntimeState
  ): { visibleText: string; newBlocks: string[] } => {
    state.thinkingBuffer += deltaText;
    const newBlocks: string[] = [];
    let visibleText = '';
    let pos = 0;

    while (pos < state.thinkingBuffer.length) {
      if (state.inThinkingBlock) {
        const closeIdx = state.thinkingBuffer.indexOf('</thinking>', pos);
        if (closeIdx >= 0) {
          const content = state.thinkingBuffer.slice(pos, closeIdx).trim();
          if (content) newBlocks.push(content);
          pos = closeIdx + '</thinking>'.length;
          state.inThinkingBlock = false;
        } else {
          break; // Wait for more data
        }
      } else {
        const openIdx = state.thinkingBuffer.indexOf('<thinking>', pos);
        if (openIdx >= 0) {
          visibleText += state.thinkingBuffer.slice(pos, openIdx);
          pos = openIdx + '<thinking>'.length;
          state.inThinkingBlock = true;
        } else {
          const remaining = state.thinkingBuffer.slice(pos);
          // Hold back potential partial tags
          const partial = remaining.match(
            /<(?:t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?)?$/i
          );
          if (partial) {
            visibleText += remaining.slice(0, partial.index);
            break;
          }
          visibleText += remaining;
          pos = state.thinkingBuffer.length;
        }
      }
    }

    state.thinkingBuffer = state.thinkingBuffer.slice(pos);
    state.thinkingBlocks.push(...newBlocks);
    return { visibleText, newBlocks };
  };

  // Get current active session state
  const getCurrentSessionState = (): SessionRuntimeState => {
    const id = chatConversationIdRef.current;
    return id ? getSessionState(id) : createInitialState();
  };

  // Cleanup session state when closing
  const cleanupSessionState = (conversationId: string) => {
    const state = sessionStates.current.get(conversationId);
    if (state) {
      state.abortController?.abort();
      if (state.streamTimerId != null) clearInterval(state.streamTimerId);
      if (state.thinkingTimerId != null) clearInterval(state.thinkingTimerId);
    }
    sessionStates.current.delete(conversationId);
  };

  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const pendingWidthRef = useRef(DEFAULT_WIDTH);
  const resizeFrameRef = useRef<number | null>(null);
  const streamingTextRef = useRef('');
  const streamingContentRef = useRef<HTMLDivElement | null>(null);
  const streamingThinkingRef = useRef('');
  const streamingCoTRef = useRef<CoTItem[]>([]);

  const completeLastTool = (cot: CoTItem[]) => {
    const last = cot[cot.length - 1];
    if (last && last.type === 'tool' && last.phase === 'started') {
      last.phase = 'completed';
      return true;
    }
    return false;
  };

  const convertThinkingToCoT = (thinking?: string[]): CoTItem[] => {
    if (!thinking) return [];
    return thinking.map((content) => ({ type: 'thinking', content }));
  };

  // Detect if user accidentally put API key in env vars field
  const detectApiKeyInEnvVars = (envVars?: string): boolean => {
    if (!envVars) return false;

    const lines = envVars.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue; // Skip comments

      const match = trimmed.match(/^([^=]+)=(.+)$/);
      if (!match) continue;

      const [, key, value] = match;
      const keyUpper = key.trim().toUpperCase();

      // Detect API key patterns
      if (
        keyUpper.includes('API_KEY') ||
        keyUpper.includes('APIKEY') ||
        keyUpper.includes('SECRET') ||
        keyUpper.includes('TOKEN')
      ) {
        // Check if value looks like an API key (starts with sk-, contains hyphens/long alphanum)
        if (value.trim().match(/^sk-[a-zA-Z0-9_-]{20,}/) || value.length > 30) {
          return true;
        }
      }
    }

    return false;
  };

  const isSendingRef = useRef(false);
  const queueRef = useRef<QueuedMessage[]>([]);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const streamTokensRef = useRef<string[]>([]);
  const streamTimerRef = useRef<number | null>(null);
  const pendingDoneRef = useRef<{ status: string; message?: string } | null>(
    null
  );
  const activityStartRef = useRef<number | null>(null);
  const thinkingTimerRef = useRef<number | null>(null);
  const lastThinkingSecondsRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const interruptedRef = useRef(false);
  const thinkingCompleteRef = useRef(false);
  const isComposingRef = useRef(false);
  const chipStoreRef = useRef<Record<string, ChipPayload>>({});
  const chipCounterRef = useRef(0);
  const messageCounterRef = useRef(0);
  const contextRingRef = useRef<SVGCircleElement | null>(null);
  const chatProjectIdRef = useRef<string | null>(null);
  const chatConversationIdRef = useRef<string | null>(null);
  const chatStateRef = useRef<StoredProjectChat | null>(null);
  const chatHydratedRef = useRef(false);
  const copyResetTimersRef = useRef<Record<string, number>>({});
  const latexCopyTimersRef = useRef<Map<HTMLElement, number>>(new Map());
  const chatSaveTimerRef = useRef<number | null>(null);
  const contextRefreshInFlightRef = useRef(false);

  const providerDisplay =
    PROVIDER_DISPLAY[chatProvider] ?? PROVIDER_DISPLAY.claude;
  const providerIndicatorClass =
    chatProvider === 'codex'
      ? 'ageaf-provider--openai'
      : 'ageaf-provider--anthropic';

  const getConnectionHealthTooltip = () => {
    let baseMessage = '';
    if (!connectionHealth.hostConnected) {
      baseMessage = 'Host not running. Check if the host server is started.';
    } else if (!connectionHealth.runtimeWorking) {
      const cliName =
        chatProvider === 'codex' ? 'Codex CLI' : 'Claude Code CLI';
      baseMessage = `${cliName} not working.Check if CLI is installed and you are logged in.`;
    } else {
      baseMessage = 'Connected';
    }

    // Add session ID if available
    if (chatConversationIdRef.current) {
      const conversationId = chatConversationIdRef.current;
      const state = chatStateRef.current;
      const conversation = state
        ? findConversation(state, conversationId)
        : null;

      let sessionId = '';
      if (
        conversation?.provider === 'codex' &&
        conversation?.providerState?.codex?.threadId
      ) {
        const threadId = conversation.providerState.codex.threadId;
        sessionId = threadId.includes('-')
          ? threadId.split('-')[0]
          : threadId.slice(0, 8);
      } else if (conversationId) {
        if (conversationId.startsWith('conv-')) {
          const parts = conversationId.split('-');
          sessionId =
            parts.length > 2
              ? parts[parts.length - 1].slice(0, 8)
              : conversationId.slice(-8);
        } else {
          sessionId = conversationId.includes('-')
            ? conversationId.split('-')[0]
            : conversationId.slice(0, 8);
        }
      }

      if (sessionId) {
        return `${baseMessage} \nSession: ${sessionId} `;
      }
    }

    return baseMessage;
  };

  const getCachedStoredUsage = (
    conversation: StoredConversation | null,
    provider: ProviderId
  ): StoredContextUsage | null => {
    if (!conversation) return null;
    if (provider === 'codex') {
      return conversation.providerState?.codex?.lastUsage ?? null;
    }
    return conversation.providerState?.claude?.lastUsage ?? null;
  };

  const setContextUsageFromStored = (stored: StoredContextUsage | null) => {
    if (!stored) {
      setContextUsage(null);
      return;
    }
    setContextUsage(
      normalizeContextUsage({
        usedTokens: stored.usedTokens,
        contextWindow: stored.contextWindow,
        percentage: stored.percentage,
      })
    );
  };

  const getContextUsageThrottleMs = (provider: ProviderId) =>
    provider === 'claude' ? 15000 : 5000;

  const getOrderedSessionIds = (state: StoredProjectChat) => {
    const claudeConversations = state.providers.claude.conversations ?? [];
    const codexConversations = state.providers.codex.conversations ?? [];
    return [...claudeConversations, ...codexConversations]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((conversation) => conversation.id);
  };

  const findConversation = (state: StoredProjectChat, conversationId: string) =>
    state.providers.claude.conversations.find(
      (conversation) => conversation.id === conversationId
    ) ??
    state.providers.codex.conversations.find(
      (conversation) => conversation.id === conversationId
    ) ??
    null;

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - event.clientX;
      const nextWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, dragStartWidth.current + delta)
      );
      pendingWidthRef.current = nextWidth;
      if (resizeFrameRef.current != null) return;
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        setWidth(pendingWidthRef.current);
      });
    };

    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.classList.remove('ageaf-resizing');
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (resizeFrameRef.current != null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Focus input on Cmd+K / Ctrl+K
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyK') {
        event.preventDefault();
        setCollapsed(false);
        // Use setTimeout to allow any layout changes (like expanding) to settle
        requestAnimationFrame(() => {
          editorRef.current?.focus();
        });
        return;
      }

      if (event.key === 'Escape') {
        // Check current session state, not global refs
        const conversationId = chatConversationIdRef.current;
        if (!conversationId) return;
        const sessionState = getSessionState(conversationId);
        if (!sessionState.isSending && sessionState.streamTimerId == null)
          return;
        event.preventDefault();
        interruptInFlightJob();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Scroll selected skill option into view when navigating with keyboard
  useEffect(() => {
    if (!skillOpen || !skillListRef.current) return;
    const activeItem = skillListRef.current.querySelector(
      '.ageaf-skill__option.is-active'
    );
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [skillIndex, skillOpen]);

  // Scroll selected mention option into view when navigating with keyboard
  useEffect(() => {
    if (!mentionOpen || !mentionListRef.current) return;
    const activeItem = mentionListRef.current.querySelector(
      '.ageaf-mention__option.is-active'
    );
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [mentionIndex, mentionOpen]);

  const checkConnectionHealth = async () => {
    const HEALTH_TTL_MS = 15_000;
    const CODEX_METADATA_CHECK_MS = 30_000;
    const options = await getOptions();
    const now = Date.now();
    const isFresh = (timestamp: number) => now - timestamp < HEALTH_TTL_MS;

    // Native mode doesn't require hostUrl
    if (options.transport !== 'native' && !options.hostUrl) {
      setConnectionHealth({ hostConnected: false, runtimeWorking: false });
      return;
    }

    let healthData: any = null;
    try {
      // Check host connection (transport-aware)
      healthData = await fetchHostHealth(options);
      lastHostOkAtRef.current = now;
    } catch {
      // Host not reachable
    }

    const hostConnected = isFresh(lastHostOkAtRef.current);
    let runtimeWorking = false;

    if (hostConnected) {
      if (chatProvider === 'claude') {
        // IMPORTANT: do NOT call /v1/runtime/claude/metadata here.
        // That path can trigger "List available models" queries, which may consume tokens.
        // Instead, use the lightweight /v1/health signal + "last successful job" stickiness.
        const configured = Boolean(healthData?.claude?.configured);
        if (configured) {
          lastRuntimeOkAtRef.current = now;
        }
        runtimeWorking = configured || isFresh(lastRuntimeOkAtRef.current);
      } else {
        // Codex metadata is local CLI-backed and does not consume LLM tokens, but starting the
        // app-server repeatedly is still expensive. Throttle these checks.
        const shouldCheckCodex =
          now - lastCodexMetadataCheckAtRef.current > CODEX_METADATA_CHECK_MS ||
          !isFresh(lastRuntimeOkAtRef.current);
        if (shouldCheckCodex) {
          lastCodexMetadataCheckAtRef.current = now;
          try {
            await fetchCodexRuntimeMetadata(options);
            lastRuntimeOkAtRef.current = now;
          } catch {
            // keep lastRuntimeOkAtRef as-is; TTL avoids brief flicker
          }
        }
        runtimeWorking = isFresh(lastRuntimeOkAtRef.current);
      }
    }

    setConnectionHealth({ hostConnected, runtimeWorking });
  };

  const checkNativeHost = async () => {
    setNativeStatusError(null);

    const request: NativeHostRequest = {
      id: crypto.randomUUID(),
      kind: 'request',
      request: { method: 'GET', path: '/v1/health' },
    };

    try {
      const response = await new Promise<NativeHostResponse>(
        (resolve, reject) => {
          const timeoutMs = 10_000;
          const timeoutId = setTimeout(() => {
            reject(new Error('native check timed out'));
          }, timeoutMs);

          chrome.runtime.sendMessage(
            { type: 'ageaf:native-request', request },
            (message) => {
              clearTimeout(timeoutId);

              const runtimeError = chrome.runtime.lastError;
              if (runtimeError?.message) {
                reject(new Error(runtimeError.message));
                return;
              }

              resolve(message as NativeHostResponse);
            }
          );
        }
      );

      if (
        response.kind === 'response' &&
        response.status >= 200 &&
        response.status < 300
      ) {
        setNativeStatus('available');
        return;
      }

      setNativeStatus('unavailable');
      if (response.kind === 'error') {
        setNativeStatusError(response.message);
      } else if (response.kind === 'response') {
        const detail =
          typeof response.body === 'object' &&
            response.body &&
            'message' in response.body
            ? String((response.body as { message: unknown }).message)
            : undefined;
        setNativeStatusError(
          detail
            ? `Health check failed(${response.status}): ${detail} `
            : `Health check failed(${response.status})`
        );
      } else {
        setNativeStatusError(`Unexpected response kind: ${response.kind} `);
      }
    } catch (error) {
      setNativeStatus('unavailable');
      setNativeStatusError(
        error instanceof Error ? error.message : 'native check failed'
      );
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadRuntime = async () => {
      const options = await getOptions();
      if (cancelled) return;
      setSettings(options);
      setSettingsMessage('');
      setYoloMode(
        chatProvider === 'codex'
          ? (options.openaiApprovalPolicy ?? 'never') === 'never'
          : options.claudeYoloMode ?? true
      );

      const conversationId = chatConversationIdRef.current;
      const state = chatStateRef.current;
      const conversation =
        conversationId && state
          ? findConversation(state, conversationId)
          : null;
      setContextUsageFromStored(
        getCachedStoredUsage(conversation, chatProvider)
      );

      if (options.transport !== 'native' && !options.hostUrl) {
        setRuntimeModels([]);
        if (chatProvider === 'codex') {
          setThinkingModes(
            FALLBACK_THINKING_MODES.map((mode) => ({
              ...mode,
              maxThinkingTokens: null,
            }))
          );
          setCurrentThinkingMode('off');
          setCurrentThinkingTokens(null);
          setCurrentModel(null);
          return;
        }
        setThinkingModes(FALLBACK_THINKING_MODES);
        setCurrentThinkingMode(options.claudeThinkingMode ?? 'off');
        setCurrentThinkingTokens(options.claudeMaxThinkingTokens ?? null);
        setCurrentModel(options.claudeModel ?? DEFAULT_MODEL_VALUE);
        return;
      }

      try {
        if (chatProvider === 'codex') {
          // Check cache first - 1 minute TTL for faster model discovery
          const cached = metadataCacheRef.current.codex;
          const now = Date.now();
          const cacheAge = cached ? now - cached.fetchedAt : Infinity;
          const CACHE_TTL = 1 * 60 * 1000; // 1 minute for faster model discovery

          let models: RuntimeModel[];
          let metadata: any;

          if (cached && cacheAge < CACHE_TTL) {
            // Use cached metadata
            models = cached.models;
          } else {
            // Fetch fresh metadata
            metadata = await fetchCodexRuntimeMetadata(options);
            if (cancelled) return;
            models = (metadata.models ?? []).filter(
              (model: RuntimeModel) => !model.value.includes('gpt-5.1')
            );
          }

          setRuntimeModels(models);

          // Determine model selection
          const resolvedModel = metadata
            ? metadata.currentModel ??
            models.find((model: RuntimeModel) => model.isDefault)?.value ??
            models[0]?.value ??
            null
            : models.find((model: RuntimeModel) => model.isDefault)?.value ??
            models[0]?.value ??
            null;
          setCurrentModel(resolvedModel);

          const selectedModel =
            (resolvedModel
              ? models.find(
                (model: RuntimeModel) => model.value === resolvedModel
              )
              : undefined) ??
            models.find((model: RuntimeModel) => model.isDefault) ??
            models[0] ??
            null;
          const supportedEfforts: Array<{
            reasoningEffort: string;
            description: string;
          }> = selectedModel?.supportedReasoningEfforts ?? [];
          const supportedModes = new Set(
            supportedEfforts.map(
              (entry: { reasoningEffort: string; description: string }) =>
                getThinkingModeIdForCodexEffort(
                  String(entry.reasoningEffort ?? '')
                )
            )
          );
          const nextThinkingModes = FALLBACK_THINKING_MODES.map((mode) => ({
            ...mode,
            maxThinkingTokens: null,
          })).filter((mode) => supportedModes.has(mode.id));
          setThinkingModes(
            nextThinkingModes.length > 0
              ? nextThinkingModes
              : FALLBACK_THINKING_MODES
          );

          // Store in cache if freshly fetched
          if (metadata) {
            metadataCacheRef.current.codex = {
              models,
              thinkingModes:
                nextThinkingModes.length > 0
                  ? nextThinkingModes
                  : FALLBACK_THINKING_MODES,
              fetchedAt: now,
            };
          }

          const effort = metadata
            ? metadata.currentReasoningEffort ??
            selectedModel?.defaultReasoningEffort ??
            null
            : selectedModel?.defaultReasoningEffort ?? null;
          setCurrentThinkingMode(getThinkingModeIdForCodexEffort(effort));
          setCurrentThinkingTokens(null);
          setYoloMode((options.openaiApprovalPolicy ?? 'never') === 'never');

          // Update connection health - runtime is working since we got metadata
          lastHostOkAtRef.current = now;
          lastRuntimeOkAtRef.current = now;
          setConnectionHealth({ hostConnected: true, runtimeWorking: true });
          void refreshContextUsage({ provider: 'codex', conversationId });
          return;
        }

        // Check cache first - 1 minute TTL for faster model discovery
        const cached = metadataCacheRef.current.claude;
        const now = Date.now();
        const cacheAge = cached ? now - cached.fetchedAt : Infinity;
        const CACHE_TTL = 1 * 60 * 1000; // 1 minute for faster model discovery

        let models: RuntimeModel[];
        let thinkingModes: ThinkingMode[];
        let metadata: any = null;

        if (cached && cacheAge < CACHE_TTL) {
          // Use cached metadata
          models = cached.models;
          thinkingModes = cached.thinkingModes;
        } else {
          // Fetch fresh metadata
          metadata = await fetchClaudeRuntimeMetadata(options);
          if (cancelled) return;
          models = metadata.models ?? [];
          thinkingModes = (
            metadata.thinkingModes ?? FALLBACK_THINKING_MODES
          ).map((mode: ThinkingMode) => ({
            ...mode,
            label: mode.label === 'Medium' ? 'Med' : mode.label,
          }));

          // Store in cache
          metadataCacheRef.current.claude = {
            models,
            thinkingModes,
            fetchedAt: now,
          };
        }

        setRuntimeModels(models);
        setThinkingModes(thinkingModes);
        setCurrentModel(
          metadata
            ? metadata.currentModel ??
            options.claudeModel ??
            DEFAULT_MODEL_VALUE
            : options.claudeModel ?? DEFAULT_MODEL_VALUE
        );
        setCurrentThinkingMode(
          metadata
            ? metadata.currentThinkingMode ??
            options.claudeThinkingMode ??
            'off'
            : options.claudeThinkingMode ?? 'off'
        );
        setCurrentThinkingTokens(
          metadata
            ? metadata.maxThinkingTokens ??
            options.claudeMaxThinkingTokens ??
            null
            : options.claudeMaxThinkingTokens ?? null
        );
        setYoloMode(options.claudeYoloMode ?? true);

        // Update connection health - runtime is working since we got metadata
        lastHostOkAtRef.current = now;
        lastRuntimeOkAtRef.current = now;
        setConnectionHealth({ hostConnected: true, runtimeWorking: true });
        void refreshContextUsage({ provider: 'claude', conversationId });
      } catch {
        if (cancelled) return;
        setRuntimeModels([]);
        if (chatProvider === 'codex') {
          setThinkingModes(
            FALLBACK_THINKING_MODES.map((mode) => ({
              ...mode,
              maxThinkingTokens: null,
            }))
          );
          setCurrentThinkingMode('off');
          setCurrentThinkingTokens(null);
          setCurrentModel(null);
          return;
        }
        setThinkingModes(FALLBACK_THINKING_MODES);
        setCurrentThinkingMode(options.claudeThinkingMode ?? 'off');
        setCurrentThinkingTokens(options.claudeMaxThinkingTokens ?? null);
        setCurrentModel(options.claudeModel ?? DEFAULT_MODEL_VALUE);
        setYoloMode(options.claudeYoloMode ?? true);
      }
    };

    void loadRuntime();
    // Check health immediately on mount/provider change
    void checkConnectionHealth();
    return () => {
      cancelled = true;
    };
  }, [chatProvider]);

  // Periodically check connection health
  useEffect(() => {
    // Check immediately, then periodically
    void checkConnectionHealth();
    const interval = setInterval(() => {
      void checkConnectionHealth();
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [chatProvider]);

  useEffect(() => {
    if (!settingsOpen) return;
    getOptions().then((options) => {
      setSettings(options);
      setSettingsMessage('');
    });
  }, [settingsOpen]);

  // (Debug trace is rendered inline in the chat when enabled.)

  useEffect(() => {
    const onOpenSettings = () => setSettingsOpen(true);
    window.addEventListener(
      'ageaf:settings:open',
      onOpenSettings as EventListener
    );
    return () => {
      window.removeEventListener(
        'ageaf:settings:open',
        onOpenSettings as EventListener
      );
    };
  }, []);

  // Detect scroll position only from user-initiated events (wheel, touchmove)
  // so that programmatic auto-scroll never overrides user intent.
  useEffect(() => {
    const chat = chatRef.current;
    if (!chat) return;
    const checkPosition = () => {
      const distance = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
      const atBottom = distance <= 24;
      if (isAtBottomRef.current !== atBottom) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
    };
    const onUserScroll = () => requestAnimationFrame(checkPosition);
    checkPosition();
    chat.addEventListener('wheel', onUserScroll, { passive: true });
    chat.addEventListener('touchmove', onUserScroll, { passive: true });
    return () => {
      chat.removeEventListener('wheel', onUserScroll);
      chat.removeEventListener('touchmove', onUserScroll);
    };
  }, [sessionIds.length]);

  useEffect(() => {
    if (!chatRef.current || !isAtBottomRef.current) return;
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, streamingText]);

  // Incremental DOM patching for the streaming message content.
  // Instead of replacing innerHTML on every token (destroying KaTeX blocks),
  // morphdom diffs the old and new DOM trees, preserving unchanged elements.
  useEffect(() => {
    const container = streamingContentRef.current;
    if (!container) return;

    if (!streamingText) {
      container.innerHTML = '';
      return;
    }

    const newHtml = renderMarkdown(streamingText);

    if (!container.innerHTML) {
      container.innerHTML = newHtml;
      return;
    }

    const target = document.createElement('div');
    target.innerHTML = newHtml;

    morphdom(container, target, {
      childrenOnly: true,
      onBeforeElUpdated(fromEl, toEl) {
        // Preserve KaTeX elements whose source LaTeX hasn't changed
        const fromLatex = fromEl.getAttribute('data-latex');
        const toLatex = toEl.getAttribute('data-latex');
        if (fromLatex !== null && fromLatex === toLatex) {
          return false;
        }

        // Preserve diagram blocks with identical SVG
        if (
          fromEl.classList.contains('ageaf-diagram') &&
          toEl.classList.contains('ageaf-diagram')
        ) {
          const fromSvg = fromEl.querySelector('.ageaf-diagram__svg')?.innerHTML;
          const toSvg = toEl.querySelector('.ageaf-diagram__svg')?.innerHTML;
          if (fromSvg && fromSvg === toSvg) {
            return false;
          }
        }

        // Preserve unchanged code blocks
        if (
          fromEl.classList.contains('ageaf-code-block') &&
          toEl.classList.contains('ageaf-code-block') &&
          fromEl.isEqualNode(toEl)
        ) {
          return false;
        }

        return true;
      },
    });
  }, [streamingText]);

  const onResizeStart = (event: MouseEvent) => {
    if (event.button !== 0) return;
    if (collapsed) {
      setCollapsed(false);
    }
    isDragging.current = true;
    dragStartX.current = event.clientX;
    dragStartWidth.current = width;
    pendingWidthRef.current = width;
    document.body.classList.add('ageaf-resizing');
    event.preventDefault();
  };

  const scrollToBottom = () => {
    const chat = chatRef.current;
    if (!chat) return;
    chat.scrollTo({
      top: chat.scrollHeight,
      behavior: 'smooth',
    });
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  };

  const setStreamingState = (text: string | null, active: boolean) => {
    setStreamingStatus(text);
    setIsStreamingActive(active);
  };

  const formatTokenCount = (value: number) => {
    if (value >= 1000) {
      return `${Math.floor(value / 1000)} k`;
    }
    return String(value);
  };

  const THINKING_COLLAPSED_LINES = 3;
  const [expandedThinkingMessages, setExpandedThinkingMessages] = useState<
    Set<string>
  >(new Set());

  const toggleThinkingExpanded = (messageId: string) => {
    setExpandedThinkingMessages((prev) => {
      const next = new Set(prev);
      next.has(messageId) ? next.delete(messageId) : next.add(messageId);
      return next;
    });
  };

  const renderCoTBlock = (
    cot: CoTItem[],
    active: boolean,
    messageId?: string,
    options?: { hideHeader?: boolean }
  ) => {
    if (!cot || cot.length === 0) return null;
    // When we have a stable messageId, let user control expanded/collapsed even during streaming.
    // Otherwise, default to expanded while active (streaming).
    const isExpanded = messageId
      ? expandedThinkingMessages.has(messageId)
      : active;
    const hideHeader = Boolean(options?.hideHeader);

    if (hideHeader && !isExpanded) return null;

    const toggle = (e: MouseEvent) => {
      e.preventDefault();
      if (messageId) toggleThinkingExpanded(messageId);
    };

    // Tool-specific icons for running state
    const getToolIcon = (toolName: string, phase: string) => {
      if (phase === 'failed') return '❌';
      if (phase === 'completed') return '✅';
      // Tool-specific icons for running state
      const icons: Record<string, string> = {
        Read: '📖',
        Write: '✍️',
        Edit: '✏️',
        Bash: '🖥️',
        Grep: '🔍',
        Glob: '📁',
        WebSearch: '🌐',
        WebFetch: '🌐',
        computer: '🖥️',
        text_editor: '📝',
        mcp: '🔌',
        Compacting: '🔄',
      };
      return icons[toolName] ?? '🔧';
    };

    // Format tool name for display
    const formatToolName = (toolName: string) => {
      const names: Record<string, string> = {
        Read: 'Read file',
        Write: 'Write file',
        Edit: 'Edit file',
        Bash: 'Run command',
        Grep: 'Search code',
        Glob: 'Find files',
        WebSearch: 'Web search',
        WebFetch: 'Web browse',
        computer: 'Computer use',
        text_editor: 'Text editor',
        mcp: 'MCP tool',
        Compacting: 'Compacting context',
      };
      return names[toolName] ?? toolName;
    };

    return (
      <div class={`ageaf-message__cot ${active ? 'is-active' : ''}`}>
        {!hideHeader ? (
          <button
            class="ageaf-message__cot-header"
            onClick={toggle}
            type="button"
          >
            <span class="ageaf-cot-arrow">{isExpanded ? '▼' : '▶'}</span>
            <span class="ageaf-cot-label">Thought Process</span>
          </button>
        ) : null}
        {isExpanded && (
          <div class="ageaf-message__cot-body">
            {cot.map((item, idx) => {
              if (item.type === 'thinking') {
                return (
                  <div key={idx} class="ageaf-cot-thinking">
                    <span class="ageaf-cot-thinking-icon">🧠</span>
                    <span class="ageaf-cot-thinking-content">
                      {item.content}
                    </span>
                  </div>
                );
              }
              // Tool
              const icon = getToolIcon(item.toolName, item.phase);
              return (
                <div
                  key={idx}
                  class={`ageaf-cot-tool ageaf-cot-tool--${item.phase}`}
                >
                  <span class="ageaf-cot-tool-icon">{icon}</span>
                  <span class="ageaf-cot-tool-name">
                    {formatToolName(item.toolName)}
                  </span>
                  {item.input && (
                    <span class="ageaf-cot-tool-input">{item.input}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderToolIndicators = () => {
    if (activeTools.size === 0) return null;

    // Tool-specific icons
    const getToolIcon = (toolName: string, phase: string) => {
      if (phase === 'failed') return '❌';
      if (phase === 'completed') return '✅';
      // Tool-specific icons for running state
      const icons: Record<string, string> = {
        Read: '📖',
        Write: '✍️',
        Edit: '✏️',
        Bash: '🖥️',
        Grep: '🔍',
        Glob: '📁',
        WebSearch: '🌐',
        WebFetch: '🌐',
        computer: '🖥️',
        text_editor: '📝',
        mcp: '🔌',
      };
      return icons[toolName] ?? '🔧';
    };

    // Format tool name for display
    const formatToolName = (toolName: string) => {
      const names: Record<string, string> = {
        Read: 'Read file',
        Write: 'Write file',
        Edit: 'Edit file',
        Bash: 'Run command',
        Grep: 'Search code',
        Glob: 'Find files',
        WebSearch: 'Web search',
        WebFetch: 'Web browse',
        computer: 'Computer use',
        text_editor: 'Text editor',
        mcp: 'MCP tool',
      };
      return names[toolName] ?? toolName;
    };

    return (
      <div class="ageaf-tool-indicators">
        {Array.from(activeTools.values()).map((tool) => (
          <div
            key={tool.toolId}
            class={`ageaf - tool - indicator ageaf - tool - indicator--${tool.phase} `}
          >
            <span class="ageaf-tool-indicator__icon">
              {getToolIcon(tool.toolName, tool.phase)}
            </span>
            <span class="ageaf-tool-indicator__name">
              {formatToolName(tool.toolName)}
            </span>
            {tool.input && (
              <span class="ageaf-tool-indicator__input">{tool.input}</span>
            )}
            {tool.phase === 'started' && (
              <span class="ageaf-tool-indicator__spinner" />
            )}
          </div>
        ))}
      </div>
    );
  };

  const createMessageId = () => {
    messageCounterRef.current += 1;
    return `msg - ${Date.now()} -${messageCounterRef.current} `;
  };

  const createMessage = (message: Omit<Message, 'id'>): Message => ({
    id: createMessageId(),
    ...message,
  });

  const toStoredMessages = (next: Message[]): StoredMessage[] =>
    next.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.statusLine ? { statusLine: message.statusLine } : {}),
      ...(message.cot ? { cot: message.cot } : {}),
      ...(message.thinking && message.thinking.length > 0
        ? { thinking: message.thinking }
        : {}),
      ...(message.images && message.images.length > 0
        ? { images: message.images }
        : {}),
      ...(message.attachments && message.attachments.length > 0
        ? { attachments: message.attachments }
        : {}),
      ...(message.patchReview ? { patchReview: message.patchReview } : {}),
    }));

  const flushChatSave = async () => {
    const projectId = chatProjectIdRef.current;
    const state = chatStateRef.current;
    if (!projectId || !state) return;
    await saveProjectChat(projectId, state);
  };

  const scheduleChatSave = () => {
    if (chatSaveTimerRef.current != null) {
      window.clearTimeout(chatSaveTimerRef.current);
    }
    chatSaveTimerRef.current = window.setTimeout(() => {
      chatSaveTimerRef.current = null;
      void flushChatSave();
    }, 250);
  };

  const hydrateChatForProject = async (
    projectId: string,
    isActive: () => boolean
  ) => {
    chatHydratedRef.current = false;
    const stored = await loadProjectChat(projectId);
    if (!isActive()) return;
    const provider = stored.activeProvider;
    const hasConversations =
      (stored.providers.claude.conversations?.length ?? 0) > 0 ||
      (stored.providers.codex.conversations?.length ?? 0) > 0;

    if (!hasConversations) {
      chatProjectIdRef.current = projectId;
      chatConversationIdRef.current = null;
      chatStateRef.current = stored;
      setChatProvider(provider);
      setSessionIds([]);
      setActiveSessionId(null);

      setStreamingState(null, false);
      setStreamingText('');
      setStreamingThinking('');
      streamingTextRef.current = '';
      streamingThinkingRef.current = '';
      streamTokensRef.current = [];
      pendingDoneRef.current = null;

      setContextUsageFromStored(null);
      setMessages([]);
      chatHydratedRef.current = true;
      scheduleChatSave();
      return;
    }
    const { state: ensured, conversation } = ensureActiveConversation(
      stored,
      provider
    );

    chatProjectIdRef.current = projectId;
    chatConversationIdRef.current = conversation.id;
    chatStateRef.current = ensured;
    setChatProvider(provider);
    setSessionIds(getOrderedSessionIds(ensured));
    setActiveSessionId(conversation.id);

    setStreamingState(null, false);
    setStreamingText('');
    setStreamingThinking('');
    streamingTextRef.current = '';
    streamingThinkingRef.current = '';
    streamTokensRef.current = [];
    pendingDoneRef.current = null;

    setContextUsageFromStored(getCachedStoredUsage(conversation, provider));
    void refreshContextUsage({ provider, conversationId: conversation.id });

    setMessages(conversation.messages.map((message) => createMessage(message)));
    chatHydratedRef.current = true;
    scheduleChatSave();
  };

  useEffect(() => {
    let active = true;
    let lastProjectId: string | null = null;

    const tick = async () => {
      const projectId = getOverleafProjectIdFromPathname(
        window.location.pathname
      );
      if (!projectId) return;
      if (projectId === lastProjectId) return;
      lastProjectId = projectId;
      await hydrateChatForProject(projectId, () => active);
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(interval);
      if (chatSaveTimerRef.current != null) {
        window.clearTimeout(chatSaveTimerRef.current);
        chatSaveTimerRef.current = null;
      }
      void flushChatSave();
    };
  }, []);

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (
        reason instanceof Error &&
        reason.message.includes('Extension context invalidated')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handler);
    return () => {
      window.removeEventListener('unhandledrejection', handler);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (attachmentErrorTimerRef.current != null) {
        window.clearTimeout(attachmentErrorTimerRef.current);
        attachmentErrorTimerRef.current = null;
      }
      const timers = copyResetTimersRef.current;
      for (const key of Object.keys(timers)) {
        window.clearTimeout(timers[key]);
      }
      copyResetTimersRef.current = {};

      // Clear any per-element LaTeX copy timers
      for (const timeoutId of latexCopyTimersRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      latexCopyTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      void insertChipFromSelection();
    };
    window.addEventListener(
      'ageaf:panel:insert-selection',
      handler as EventListener
    );
    return () => {
      window.removeEventListener(
        'ageaf:panel:insert-selection',
        handler as EventListener
      );
    };
  }, []);

  useEffect(() => {
    const projectId = chatProjectIdRef.current;
    const conversationId = chatConversationIdRef.current;
    const state = chatStateRef.current;
    if (!projectId || !conversationId || !state) return;
    const next = setConversationMessages(
      state,
      chatProvider,
      conversationId,
      toStoredMessages(messages)
    );
    chatStateRef.current = next;
    scheduleChatSave();
  }, [messages, chatProvider]);

  const ATTACHMENT_LABEL_REGEX = /^\[Attachment: .+ · \d+ lines\]$/;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const FILE_ATTACHMENT_EXTENSIONS = [
    '.txt',
    '.md',
    '.json',
    '.yaml',
    '.yml',
    '.csv',
    '.xml',
    '.toml',
    '.ini',
    '.log',
    '.tex',
  ];
  const MAX_FILE_ATTACHMENTS = 10;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_TOTAL_FILE_BYTES = 100 * 1024 * 1024;

  const updateImageAttachments = (next: ImageAttachment[]) => {
    imageAttachmentsRef.current = next;
    setImageAttachments(next);
    syncEditorEmpty();
  };

  const updateFileAttachments = (next: FileAttachment[]) => {
    fileAttachmentsRef.current = next;
    setFileAttachments(next);
    syncEditorEmpty();
  };

  const updateProjectFiles = (next: OverleafEntry[]) => {
    projectFilesRef.current = next;
    setProjectFiles(next);
  };

  const showAttachmentError = (message: string) => {
    setAttachmentError(message);
    if (attachmentErrorTimerRef.current != null) {
      window.clearTimeout(attachmentErrorTimerRef.current);
    }
    attachmentErrorTimerRef.current = window.setTimeout(() => {
      setAttachmentError(null);
      attachmentErrorTimerRef.current = null;
    }, 3000);
  };

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    );
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]
      } `;
  };

  const truncateName = (name: string, max = 24) => {
    if (name.length <= max) return name;
    const extMatch = name.match(/\.[^/.]+$/);
    const ext = extMatch ? extMatch[0] : '';
    const base = name.slice(0, Math.max(0, max - ext.length - 1));
    return `${base}…${ext} `;
  };

  const getImageMediaType = (file: File): string | null => {
    const type = file.type?.toLowerCase();
    if (
      type &&
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type)
    ) {
      return type;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.gif')) return 'image/gif';
    if (name.endsWith('.webp')) return 'image/webp';
    return null;
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () =>
        reject(reader.error ?? new Error('Failed to read file'));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Unexpected file reader result'));
          return;
        }
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.readAsDataURL(file);
    });

  const makeImageAttachmentId = () =>
    `img - ${Date.now()} -${Math.random().toString(16).slice(2)} `;

  const addImageFromFile = async (file: File, source: 'paste' | 'drop') => {
    if (file.size > MAX_IMAGE_BYTES) {
      showAttachmentError(
        `Image exceeds ${formatBytes(MAX_IMAGE_BYTES)} limit.`
      );
      return;
    }
    const mediaType = getImageMediaType(file);
    if (!mediaType) {
      showAttachmentError(
        'Unsupported image type. Use JPG, PNG, GIF, or WebP.'
      );
      return;
    }

    try {
      const data = await fileToBase64(file);
      const attachment: ImageAttachment = {
        id: makeImageAttachmentId(),
        name: file.name || 'image',
        mediaType,
        data,
        size: file.size,
        source,
      };
      updateImageAttachments([...imageAttachmentsRef.current, attachment]);
    } catch (error) {
      showAttachmentError('Failed to read image.');
    }
  };

  const addImagesFromFiles = async (
    files: FileList | File[],
    source: 'paste' | 'drop'
  ) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    let added = false;
    for (const file of list) {
      if (!getImageMediaType(file)) continue;
      // eslint-disable-next-line no-await-in-loop
      await addImageFromFile(file, source);
      added = true;
    }
    if (!added) {
      showAttachmentError('Only image files can be attached.');
    }
  };

  const removeImageAttachment = (id: string) => {
    updateImageAttachments(
      imageAttachmentsRef.current.filter((item) => item.id !== id)
    );
  };

  const getImageDataUrl = (image: ImageAttachment) =>
    `data:${image.mediaType}; base64, ${image.data} `;

  const getFileExtension = (name: string) => {
    const match = name.match(/\.[a-z0-9]+$/i);
    return match ? match[0].toLowerCase() : '';
  };

  const classifyOverleafFile = (name: string): OverleafEntry['kind'] => {
    const ext = getFileExtension(name);
    if (ext === '.tex') return 'tex';
    if (ext === '.bib') return 'bib';
    if (
      ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf'].includes(ext)
    ) {
      return 'img';
    }
    return 'other';
  };

  const MENTION_EXTENSIONS = [
    '.tex',
    '.bib',
    '.sty',
    '.cls',
    '.md',
    '.json',
    '.yaml',
    '.yml',
    '.csv',
    '.xml',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.pdf',
  ];

  const extractFilenamesFromText = (value: string): string[] => {
    const extPattern = MENTION_EXTENSIONS.map((ext) =>
      ext.replace('.', '\\.')
    ).join('|');
    const regex = new RegExp(
      `([A - Za - z0 -9_. -] + (?: ${extPattern}))`,
      'gi'
    );

    const sanitizeLabel = (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return '';
      const tokens = trimmed.split(/\s+/);
      return tokens.join(' ').trim();
    };

    const isAllowedFilename = (token: string) => {
      const ext = getFileExtension(token);
      return !!ext && MENTION_EXTENSIONS.includes(ext);
    };

    const stripUiPrefixes = (token: string) => {
      let t = token.trim();
      // Overleaf often concatenates accessibility labels into the same token.
      // Examples we've seen:
      // - "description1.Introduction.texmore"
      // - "imagedraft-clean.pdf"
      t = t.replace(/^description/i, '').replace(/more$/i, '');

      // Strip common UI prefixes *only if* the remainder still looks like a valid filename.
      const prefixes = ['image', 'file', 'document', 'attachment'];
      for (const prefix of prefixes) {
        if (t.toLowerCase().startsWith(prefix)) {
          const remainder = t.slice(prefix.length);
          if (isAllowedFilename(remainder)) {
            t = remainder;
          }
        }
      }
      return t.trim();
    };

    const sanitizeToken = (token: string) => {
      let t = stripUiPrefixes(token);

      // If it's still contaminated, pick the best-looking filename-like substring.
      const inner = Array.from(t.matchAll(regex)).map((m) =>
        String(m[0] ?? '')
      );
      if (inner.length > 0) {
        const candidate = inner[inner.length - 1]!;
        t = stripUiPrefixes(candidate);
      }

      return sanitizeLabel(t);
    };

    return Array.from(value.matchAll(regex))
      .map((match) => sanitizeToken(String(match[0] ?? '')))
      .filter(Boolean);
  };

  const detectProjectFilesHeuristic = (): OverleafEntry[] => {
    const byKey = new Map<string, OverleafEntry>();

    const sanitizeLabel = (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return '';
      return trimmed
        .replace(/^description/i, '')
        .replace(/more$/i, '')
        .trim();
    };

    const isFolderNode = (node: HTMLElement) => {
      if (node.getAttribute('aria-expanded') != null) return true;
      if (node.getAttribute('data-type') === 'folder') return true;
      const className = node.className ?? '';
      return /\bfolder\b/i.test(className);
    };

    const getLabelText = (node: HTMLElement) =>
      sanitizeLabel(
        node.getAttribute('aria-label')?.trim() ||
        node.getAttribute('title')?.trim() ||
        node.textContent?.trim() ||
        ''
      );

    const buildTreePath = (
      node: HTMLElement,
      name: string,
      kind: OverleafEntry['kind']
    ) => {
      const parts: string[] = [];
      let current: HTMLElement | null = node;
      while (current) {
        if (current === node) {
          current = current.parentElement;
          continue;
        }
        if (
          current.getAttribute?.('role') === 'treeitem' &&
          isFolderNode(current)
        ) {
          const label = getLabelText(current);
          if (label) parts.unshift(label);
        }
        current = current.parentElement;
      }
      if (kind !== 'folder') parts.push(name);
      const path = parts.length > 0 ? parts.join('/') : name;
      return path;
    };

    const addFromText = (text: string) => {
      for (const name of extractFilenamesFromText(text)) {
        const ext = getFileExtension(name);
        if (!ext) continue;
        const key = `file:${name.toLowerCase()} `;
        const next: OverleafEntry = {
          name,
          path: name,
          ext,
          kind: classifyOverleafFile(name),
        };

        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, next);
          continue;
        }

        // Prefer the cleanest/shortest token (avoids duplicates like "imagedraft-clean.pdf")
        const existingStartsDirty =
          /^(description|image|file|document|attachment)/i.test(existing.name);
        const nextStartsDirty =
          /^(description|image|file|document|attachment)/i.test(next.name);

        const better =
          (existingStartsDirty && !nextStartsDirty) ||
          (existingStartsDirty === nextStartsDirty &&
            next.name.length < existing.name.length);

        if (better) byKey.set(key, next);
      }
    };

    // 1) Tabs (most reliable)
    const tabNodes = Array.from(
      document.querySelectorAll('[role="tab"], .cm-tab, .cm-tab-label')
    );
    for (const node of tabNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.closest('#ageaf-panel-root')) continue;
      const text =
        node.getAttribute('aria-label')?.trim() ||
        node.getAttribute('title')?.trim() ||
        node.textContent?.trim();
      if (!text) continue;
      addFromText(text);
    }
    if (byKey.size > 0) return Array.from(byKey.values());

    // 2) Common file tree labels
    const treeNodes = Array.from(
      document.querySelectorAll(
        [
          '[data-testid="file-name"]',
          '[role="treeitem"]',
          '.file-tree-item-name',
          '.file-name',
          '.entity-name',
          '.file-label',
        ].join(', ')
      )
    );
    for (const node of treeNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.closest('#ageaf-panel-root')) continue;
      const text =
        node.getAttribute('aria-label')?.trim() ||
        node.getAttribute('title')?.trim() ||
        node.textContent?.trim();
      if (!text) continue;
      const label = sanitizeLabel(text);
      const isFolder = isFolderNode(node);
      if (isFolder && label && !getFileExtension(label)) {
        const path = buildTreePath(node, label, 'folder');
        const key = `folder:${path.toLowerCase()} `;
        if (!byKey.has(key)) {
          byKey.set(key, { name: label, path, ext: '', kind: 'folder' });
        }
        continue;
      }
      const ext = getFileExtension(label);
      if (ext) {
        const path = buildTreePath(node, label, classifyOverleafFile(label));
        const key = `file:${path.toLowerCase()} `;
        if (!byKey.has(key)) {
          byKey.set(key, {
            name: label,
            path,
            ext,
            kind: classifyOverleafFile(label),
          });
        }
        continue;
      }
      addFromText(label);
    }
    if (byKey.size > 0) return Array.from(byKey.values());

    // 3) Last resort: scan text nodes (capped)
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    let scanned = 0;
    while (scanned < 8000) {
      const node = walker.nextNode() as Text | null;
      if (!node) break;
      scanned += 1;
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest('#ageaf-panel-root')) continue;
      const text = (node.textContent ?? '').trim();
      if (text.length < 4 || text.length > 200) continue;
      if (
        !/[.](tex|bib|sty|cls|md|json|ya?ml|csv|xml|png|jpe?g|gif|svg|pdf)\b/i.test(
          text
        )
      ) {
        continue;
      }
      addFromText(text);
      if (byKey.size >= 200) break;
    }

    return Array.from(byKey.values());
  };

  const refreshProjectFiles = () => {
    const next = detectProjectFilesHeuristic();
    if (next.length > 0) updateProjectFiles(next);
  };

  const getMentionQuery = () => {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return null;
    const node = range.endContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const textNode = node as Text;
    const anchorOffset = range.endOffset;
    const before = textNode.data.slice(0, anchorOffset);
    const match = before.match(/(^|[\s\(\[\{])@([A-Za-z0-9._/-]*)$/);
    if (!match) return null;
    const query = match[2] ?? '';
    const start = anchorOffset - (query.length + 1);
    return { query, node: textNode, start, end: anchorOffset };
  };

  const filterMentionResults = (query: string) => {
    const q = query.toLowerCase();
    const files = projectFilesRef.current;
    const scored = files
      .map((file) => {
        const name = file.name.toLowerCase();
        const path = file.path.toLowerCase();
        let score = 3;
        if (q.length === 0) score = 1;
        else if (name.startsWith(q) || path.startsWith(q)) score = 0;
        else if (name.includes(q) || path.includes(q)) score = 2;
        return { file, score };
      })
      .filter((entry) => entry.score < 3)
      .sort((a, b) =>
        a.score === b.score
          ? a.file.path.localeCompare(b.file.path)
          : a.score - b.score
      )
      .slice(0, 20)
      .map((entry) => entry.file);
    return scored;
  };

  const updateMentionState = () => {
    if (isComposingRef.current) return;
    const match = getMentionQuery();
    if (!match) {
      setMentionOpen(false);
      setMentionResults([]);
      mentionRangeRef.current = null;
      return;
    }
    if (projectFilesRef.current.length === 0) refreshProjectFiles();
    const results = filterMentionResults(match.query);
    mentionRangeRef.current = {
      node: match.node,
      start: match.start,
      end: match.end,
    };
    setMentionResults(results);
    setMentionIndex(0);
    setMentionOpen(true);
    // Close skill menu when mention menu opens (mutually exclusive)
    setSkillOpen(false);
  };

  const insertMentionEntry = (entry: OverleafEntry) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection) return;
    const rangeInfo = mentionRangeRef.current;
    if (rangeInfo) {
      const { node, start, end } = rangeInfo;
      node.data = node.data.slice(0, start) + node.data.slice(end);
      const range = document.createRange();
      range.setStart(node, start);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const chip = document.createElement('span');
    chip.className = 'ageaf-panel__mention';
    chip.dataset.mention = entry.kind === 'folder' ? 'folder' : 'file';
    chip.dataset.path = entry.path;
    chip.setAttribute('contenteditable', 'false');
    chip.textContent = `@${entry.name} `;
    insertNodeAtCursor(chip);
    insertTextAtCursor(' ');
    setMentionOpen(false);
    setMentionResults([]);
    mentionRangeRef.current = null;
    syncEditorEmpty();
  };

  const getSlashQuery = () => {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return null;
    const node = range.endContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const textNode = node as Text;
    const anchorOffset = range.endOffset;
    const before = textNode.data.slice(0, anchorOffset);
    console.log(
      '[getSlashQuery] before:',
      JSON.stringify(before),
      'offset:',
      anchorOffset
    );
    const match = before.match(/(^|[\s\(\[\{])\/([A-Za-z0-9._-]*)$/);
    console.log('[getSlashQuery] match:', match);
    if (!match) return null;
    const query = match[2] ?? '';
    const start = anchorOffset - (query.length + 1);
    return { query, node: textNode, start, end: anchorOffset };
  };

  const updateSkillState = async () => {
    console.log('[updateSkillState] called');
    if (isComposingRef.current) return;
    const match = getSlashQuery();
    console.log('[updateSkillState] match result:', match);
    if (!match) {
      setSkillOpen(false);
      setSkillResults([]);
      skillRangeRef.current = null;
      return;
    }
    try {
      console.log('[updateSkillState] loading manifest...');
      const manifest = await loadSkillsManifest();
      console.log(
        '[updateSkillState] manifest loaded, skills:',
        manifest.skills.length
      );
      const results = searchSkills(manifest.skills, match.query);
      console.log(
        '[updateSkillState] search results:',
        results.length,
        'for query:',
        match.query
      );
      skillRangeRef.current = {
        node: match.node,
        start: match.start,
        end: match.end,
      };
      setSkillResults(results.slice(0, 20));
      setSkillIndex(0);
      setSkillOpen(true);
      console.log('[updateSkillState] skill menu opened');
      // Close mention menu when skill menu opens (mutually exclusive)
      setMentionOpen(false);
    } catch (err) {
      console.error('[updateSkillState] Failed to load skills:', err);
      setSkillOpen(false);
      setSkillResults([]);
    }
  };

  const insertSkill = (skill: SkillEntry) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection) return;
    const rangeInfo = skillRangeRef.current;
    if (rangeInfo) {
      const { node, start, end } = rangeInfo;
      node.data = node.data.slice(0, start) + node.data.slice(end);
      const range = document.createRange();
      range.setStart(node, start);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    insertTextAtCursor(`/${skill.name} `);
    setSkillOpen(false);
    setSkillResults([]);
    skillRangeRef.current = null;
    syncEditorEmpty();
  };

  const processSkillDirectives = async (
    text: string
  ): Promise<{ skillsPrompt: string; strippedText: string }> => {
    // Extract skill directives from text (e.g., /langchain, /vllm)
    // Pattern: (start OR whitespace/bracket) + "/" + (allowed chars)
    const pattern = /(^|[\s([{])\/\s*([A-Za-z0-9._-]+)(\s|$|[\s)\]}.,;!?])/g;
    const matches = text.matchAll(pattern);
    const directiveNames: string[] = [];
    const seen = new Set<string>();

    for (const match of matches) {
      const skillName = String(match[2] ?? '')
        .trim()
        .toLowerCase();
      if (skillName && !seen.has(skillName)) {
        directiveNames.push(skillName);
        seen.add(skillName);
      }
    }

    if (directiveNames.length === 0) {
      return { skillsPrompt: '', strippedText: text };
    }

    console.log('[processSkillDirectives] Found directives:', directiveNames);

    // Load skills manifest and find matching skills
    try {
      const manifest = await loadSkillsManifest();
      const skillContents: string[] = [];
      const resolvedNames = new Set<string>();

      for (const name of directiveNames) {
        const skill = manifest.skills.find(
          (s) => s.name.toLowerCase() === name
        );
        if (skill) {
          const markdown = await loadSkillMarkdown(skill);
          const contentLength = markdown.length;
          skillContents.push(`# Skill: ${skill.name}\n\n${markdown}`);
          resolvedNames.add(name);
          console.log(
            `[processSkillDirectives] ✓ Loaded skill: /${name} (${contentLength} chars)`
          );
        } else {
          console.log(`[processSkillDirectives] ✗ Skill not found: /${name}`);
        }
      }

      const invokedSkills = Array.from(resolvedNames)
        .map((name) => `/${name}`)
        .join(', ');
      const skillsPrompt =
        skillContents.length > 0
          ? [
            '# Active skill directives',
            `The user invoked: ${invokedSkills}.`,
            'Apply the following skill instructions for this request.',
            '',
            ...skillContents,
          ].join('\n')
          : '';

      // Keep directives in the message (normalize spacing), so providers consistently see that a skill was invoked.
      const strippedText = text.replace(
        pattern,
        (match, before, skillName, after) => {
          const normalized = String(skillName ?? '')
            .trim()
            .toLowerCase();
          if (resolvedNames.has(normalized)) {
            return `${before}/${normalized}${after}`;
          }
          return match; // Keep unknown directives intact
        }
      );

      // If the message is only directives, add a minimal instruction so the runtime knows what to do.
      if (resolvedNames.size > 0) {
        const withoutDirectives = text.replace(
          pattern,
          (match, before, skillName, after) => {
            const normalized = String(skillName ?? '')
              .trim()
              .toLowerCase();
            if (resolvedNames.has(normalized)) return `${before}${after}`;
            return match;
          }
        );
        if (!withoutDirectives.trim()) {
          const requestLine = `Apply ${invokedSkills} to the provided text/context.`;
          const unique = new Set<string>(
            [strippedText.trim(), requestLine].filter(Boolean)
          );
          return {
            skillsPrompt,
            strippedText: Array.from(unique).join('\n\n'),
          };
        }
      }

      if (resolvedNames.size > 0) {
        console.log(
          `[processSkillDirectives] Injected ${resolvedNames.size} skill(s) into system prompt (${skillsPrompt.length} chars total)`
        );
        console.log(
          '[processSkillDirectives] Skills injected:',
          Array.from(resolvedNames)
            .map((n) => `/${n}`)
            .join(', ')
        );
      }

      return { skillsPrompt, strippedText };
    } catch (err) {
      console.error(
        '[processSkillDirectives] Failed to process skill directives:',
        err
      );
      return { skillsPrompt: '', strippedText: text };
    }
  };

  const formatLineCount = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '0';
    if (value >= 1000) {
      const rounded = Math.round(value / 100) / 10;
      return `${rounded}k`;
    }
    return String(value);
  };

  const mergeFileAttachments = (
    existing: FileAttachment[],
    incoming: FileAttachment[]
  ) => {
    const next = [...existing];
    const seenPaths = new Set(
      existing.map((item) =>
        item.path ? item.path : `name:${item.name}:${item.sizeBytes}`
      )
    );
    for (const attachment of incoming) {
      const key = attachment.path
        ? attachment.path
        : `name:${attachment.name}:${attachment.sizeBytes}`;
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      next.push(attachment);
    }
    return next;
  };

  const requestAttachmentValidation = async (
    entries: Array<{
      path?: string;
      name?: string;
      ext?: string;
      content?: string;
    }>
  ): Promise<{
    attachments: AttachmentMeta[];
    errors: Array<{ id?: string; path?: string; message: string }>;
  }> => {
    const options = await getOptions();
    if (options.transport !== 'native' && !options.hostUrl) {
      throw new Error('Host URL not configured');
    }
    const response = await validateAttachmentEntries(options, {
      entries,
      limits: {
        maxFiles: MAX_FILE_ATTACHMENTS,
        maxFileBytes: MAX_FILE_BYTES,
        maxTotalBytes: MAX_TOTAL_FILE_BYTES,
      },
    });
    return response;
  };

  const onOpenFilePicker = async () => {
    try {
      const options = await getOptions();
      if (options.transport !== 'native' && !options.hostUrl) {
        showAttachmentError('Host URL not configured.');
        return;
      }
      const { paths } = await openAttachmentDialog(options, {
        multiple: true,
        extensions: FILE_ATTACHMENT_EXTENSIONS,
      });
      if (!paths.length) return;
      const { attachments, errors } = await requestAttachmentValidation(
        paths.map((path) => ({ path }))
      );
      if (errors.length > 0) {
        showAttachmentError(errors[0].message);
      }
      const next = mergeFileAttachments(
        fileAttachmentsRef.current,
        attachments
      );
      updateFileAttachments(next);
    } catch (error) {
      showAttachmentError(
        error instanceof Error ? error.message : 'Failed to attach files.'
      );
    }
  };

  const addDroppedTextFiles = async (files: File[]) => {
    const entries: Array<{ name: string; ext: string; content: string }> = [];
    for (const file of files) {
      const ext = getFileExtension(file.name);
      if (!ext || !FILE_ATTACHMENT_EXTENSIONS.includes(ext)) continue;
      if (file.size > MAX_FILE_BYTES) {
        showAttachmentError(
          `File exceeds ${formatBytes(MAX_FILE_BYTES)} limit.`
        );
        continue;
      }
      const text = await file.text();
      entries.push({ name: file.name, ext, content: text });
    }
    if (entries.length === 0) {
      showAttachmentError('Unsupported file type.');
      return;
    }
    const { attachments, errors } = await requestAttachmentValidation(
      entries.map((entry) => ({
        name: entry.name,
        ext: entry.ext,
        content: entry.content,
      }))
    );
    if (errors.length > 0) {
      showAttachmentError(errors[0].message);
    }
    const mapped = attachments.map((attachment) => ({
      ...attachment,
      content: attachment.content,
    }));
    const next = mergeFileAttachments(fileAttachmentsRef.current, mapped);
    updateFileAttachments(next);
  };

  const markCopied = (id: string) => {
    setCopiedItems((current) => ({ ...current, [id]: true }));
    const timers = copyResetTimersRef.current;
    if (timers[id]) {
      window.clearTimeout(timers[id]);
    }
    timers[id] = window.setTimeout(() => {
      setCopiedItems((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      delete timers[id];
    }, 3000);
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (error) {
          // Extension context invalidated - treat as a no-op.
          if (
            error instanceof Error &&
            error.message.includes('Extension context invalidated')
          ) {
            return false;
          }
          // fall through to legacy copy
        }
      }

      if (typeof document === 'undefined') return false;
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Extension context invalidated')
      ) {
        return false;
      }
      return false;
    }
  };

  type QuoteData = {
    html: string;
    language?: string;
    languageLabel?: string;
  };

  const ATTACHMENT_LABEL_INLINE_REGEX =
    /\[Attachment:\s+(.+?)\s+·\s+(\d+)\s+lines\]/g;
  const MENTION_INLINE_REGEX = /@\[(file|folder):([^\]]+)\]/g;

  const createAttachmentChip = (
    filename: string,
    lineCount: string,
    preview?: string
  ) => {
    const iconMetaForFilename = (name: string) => {
      const extMatch = name.match(/\.[a-z0-9]+$/i);
      const ext = extMatch ? extMatch[0].toLowerCase() : '';
      switch (ext) {
        case '.tex':
          return { label: 'TeX', className: 'tex' };
        case '.md':
          return { label: 'MD', className: 'md' };
        case '.json':
          return { label: '{}', className: 'json' };
        case '.yaml':
        case '.yml':
          return { label: 'YAML', className: 'yaml' };
        case '.csv':
          return { label: 'CSV', className: 'csv' };
        case '.xml':
          return { label: 'XML', className: 'xml' };
        case '.toml':
          return { label: 'TOML', className: 'toml' };
        case '.ini':
          return { label: 'INI', className: 'ini' };
        case '.log':
          return { label: 'LOG', className: 'log' };
        case '.txt':
          return { label: 'TXT', className: 'txt' };
        default:
          return { label: 'FILE', className: 'file' };
      }
    };

    const iconMeta = iconMetaForFilename(filename);
    const chip = document.createElement('span');
    chip.className = 'ageaf-panel__chip ageaf-message__attachment-chip';
    chip.setAttribute('contenteditable', 'false');
    chip.setAttribute('aria-label', `${filename} ${lineCount || ''}`.trim());
    if (preview) chip.title = preview;

    const icon = document.createElement('span');
    icon.className = `ageaf-panel__chip-icon ageaf-panel__chip-icon--${iconMeta.className}`;
    icon.textContent = iconMeta.label;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'ageaf-panel__chip-name';
    nameSpan.textContent = filename;

    const rangeSpan = document.createElement('span');
    rangeSpan.className = 'ageaf-panel__chip-range';
    rangeSpan.textContent = lineCount || '';

    chip.append(icon, nameSpan, rangeSpan);
    return chip;
  };

  const createMentionChip = (kind: 'file' | 'folder', path: string) => {
    const chip = document.createElement('span');
    chip.className = 'ageaf-panel__mention';
    chip.setAttribute('contenteditable', 'false');
    chip.dataset.mention = kind;
    chip.dataset.path = path;
    chip.title = path;

    const name = path.split('/').filter(Boolean).pop() ?? path;
    chip.textContent = `@${name}`;
    return chip;
  };

  const decorateAttachmentLabelsHtml = (html: string) => {
    if (typeof document === 'undefined') return html;
    const container = document.createElement('div');
    container.innerHTML = html;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let current: Node | null = walker.nextNode();
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) textNodes.push(current as Text);
      current = walker.nextNode();
    }

    for (const node of textNodes) {
      const raw = node.nodeValue ?? '';
      if (!raw.includes('[Attachment:')) continue;
      ATTACHMENT_LABEL_INLINE_REGEX.lastIndex = 0;
      const matches = Array.from(raw.matchAll(ATTACHMENT_LABEL_INLINE_REGEX));
      if (matches.length === 0) continue;

      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      for (const m of matches) {
        const idx = m.index ?? -1;
        if (idx < 0) continue;
        const before = raw.slice(lastIndex, idx);
        if (before) frag.appendChild(document.createTextNode(before));
        const filename = String(m[1] ?? '').trim() || 'snippet.tex';
        const lineCount = String(m[2] ?? '').trim();
        const preview =
          node.parentElement?.getAttribute('data-attachment-preview') ?? '';
        frag.appendChild(
          createAttachmentChip(filename, lineCount, preview || undefined)
        );
        lastIndex = idx + m[0].length;
      }
      const after = raw.slice(lastIndex);
      if (after) frag.appendChild(document.createTextNode(after));
      node.replaceWith(frag);
    }

    return container.innerHTML;
  };

  const decorateMentionsHtml = (html: string) => {
    if (typeof document === 'undefined') return html;
    const container = document.createElement('div');
    container.innerHTML = html;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let current: Node | null = walker.nextNode();
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) textNodes.push(current as Text);
      current = walker.nextNode();
    }

    for (const node of textNodes) {
      const parentEl = node.parentElement;
      if (parentEl && parentEl.closest('pre, code')) continue;
      const raw = node.nodeValue ?? '';
      if (!raw.includes('@[')) continue;
      MENTION_INLINE_REGEX.lastIndex = 0;
      const matches = Array.from(raw.matchAll(MENTION_INLINE_REGEX));
      if (matches.length === 0) continue;

      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      for (const m of matches) {
        const idx = m.index ?? -1;
        if (idx < 0) continue;
        const before = raw.slice(lastIndex, idx);
        if (before) frag.appendChild(document.createTextNode(before));
        const kind = (m[1] === 'folder' ? 'folder' : 'file') as
          | 'file'
          | 'folder';
        const path = String(m[2] ?? '').trim();
        frag.appendChild(createMentionChip(kind, path));
        lastIndex = idx + m[0].length;
      }
      const after = raw.slice(lastIndex);
      if (after) frag.appendChild(document.createTextNode(after));
      node.replaceWith(frag);
    }

    return container.innerHTML;
  };

  const extractQuotesFromHtml = (html: string) => {
    if (typeof document === 'undefined') {
      return { mainHtml: html, quotes: [] as QuoteData[], interrupted: false };
    }

    const container = document.createElement('div');
    container.innerHTML = html;
    const mainContainer = document.createElement('div');
    const quotes: QuoteData[] = [];
    let interrupted = false;
    const nodes = Array.from(container.childNodes);

    const isWhitespaceText = (node: Node) =>
      node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim();

    const findNextElementIndex = (start: number) => {
      for (let i = start; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (isWhitespaceText(node)) continue;
        if (node.nodeType === Node.ELEMENT_NODE) return i;
        break;
      }
      return -1;
    };

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (isWhitespaceText(node)) continue;

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (element.tagName === 'BLOCKQUOTE') {
          quotes.push({ html: element.outerHTML });
          continue;
        }

        if (element.tagName === 'PRE') {
          // Extract language info from data attributes
          const language = element.getAttribute('data-language') || undefined;
          const languageLabel =
            element.getAttribute('data-language-label') || undefined;
          quotes.push({
            html: element.outerHTML,
            language,
            languageLabel,
          });
          continue;
        }

        if (element.tagName === 'P') {
          const text = element.textContent?.trim() ?? '';
          if (text === INTERRUPTED_BY_USER_MARKER) {
            // Render the interrupt marker as a footer after quotes/blocks, not inline.
            interrupted = true;
            continue;
          }
          if (
            text.includes('[Attachment:') &&
            /\[Attachment:\s+.+?\s+·\s+\d+\s+lines\]/.test(text)
          ) {
            const nextIndex = findNextElementIndex(i + 1);
            if (nextIndex !== -1) {
              const nextNode = nodes[nextIndex] as HTMLElement;
              if (nextNode.tagName === 'PRE') {
                const buildPreview = (raw: string) => {
                  const normalized = raw
                    .replace(/\r\n/g, '\n')
                    .replace(/\r/g, '\n')
                    .trim();
                  if (!normalized) return '';
                  const lines = normalized.split('\n');
                  const maxLines = 6;
                  let value = lines.slice(0, maxLines).join('\n');
                  if (lines.length > maxLines) value += '\n…';
                  const maxChars = 240;
                  if (value.length > maxChars) value = `${value.slice(0, maxChars)}…`;
                  return value;
                };
                const rawCode =
                  nextNode.querySelector('code')?.textContent ??
                  nextNode.textContent ??
                  '';
                const preview = buildPreview(rawCode);
                if (preview) {
                  element.setAttribute('data-attachment-preview', preview);
                }
                // Hide the following code block in the transcript UI, but keep the label paragraph.
                // (The raw text still lives in the message content and is sent to the runtime.)
                i = nextIndex;
              }
            }
          }
        }
      }

      mainContainer.appendChild(node.cloneNode(true));
    }

    return { mainHtml: mainContainer.innerHTML, quotes, interrupted };
  };

  const extractCopyTextFromQuoteHtml = (html: string): string => {
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = html;

    // Rendered LaTeX fences store the source on the PRE
    const latexPre = tempContainer.querySelector(
      'pre[data-latex]'
    ) as HTMLElement | null;
    if (latexPre) {
      const rawLatex = latexPre.getAttribute('data-latex');
      if (rawLatex) return `\\[${rawLatex}\\]`;
    }

    // Check for code blocks (PRE > CODE)
    const preElement = tempContainer.querySelector('pre > code');
    if (preElement) {
      return preElement.textContent || '';
    }

    // Check for blockquote
    const blockquote = tempContainer.querySelector('blockquote');
    if (blockquote) {
      // Process LaTeX elements recursively
      const extractTextWithLatex = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || '';
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;

          // If this is a LaTeX element, extract raw LaTeX from data attribute
          if (element.classList.contains('ageaf-latex')) {
            const rawLatex = element.getAttribute('data-latex');
            if (rawLatex) {
              // Wrap with appropriate delimiters based on display mode
              if (element.classList.contains('ageaf-latex--display')) {
                return `\\[${rawLatex}\\]`;
              } else {
                return `\\(${rawLatex}\\)`;
              }
            }
          }

          // Recursively process children
          let text = '';
          for (const child of Array.from(element.childNodes)) {
            text += extractTextWithLatex(child);
          }
          return text;
        }

        return '';
      };

      return extractTextWithLatex(blockquote);
    }

    // Fallback to plain text
    return tempContainer.textContent || '';
  };

  const extractQuoteCopyFromMarkdown = (markdown: string) => {
    const tokens = parseMarkdown(markdown);
    const lines = markdown.split(/\r\n|\n|\r/);
    const copies: string[] = [];

    const pushLines = (start: number, end: number) => {
      if (start < 0 || end <= start || start >= lines.length) return;
      copies.push(lines.slice(start, Math.min(end, lines.length)).join('\n'));
    };

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.type === 'blockquote_open' && token.level === 0 && token.map) {
        pushLines(token.map[0], token.map[1]);
        continue;
      }

      if (token.type === 'fence' && token.level === 0) {
        copies.push(token.content);
        continue;
      }

      if (
        token.type === 'inline' &&
        token.level === 0 &&
        ATTACHMENT_LABEL_REGEX.test(token.content.trim())
      ) {
        const fenceToken = tokens
          .slice(i + 1)
          .find((entry) => entry.type === 'fence' && entry.level === 0);
        if (fenceToken) {
          i = tokens.indexOf(fenceToken);
        }
      }
    }

    return copies;
  };

  const createChipId = () => {
    chipCounterRef.current += 1;
    return `chip-${Date.now()}-${chipCounterRef.current}`;
  };

  const normalizeFilenameLabel = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    let value = raw.trim();
    if (!value) return null;
    value = value.replace(/\*+$/, '').trim(); // unsaved marker
    value = value.replace(/\s*\(.*?\)\s*$/, '').trim(); // trailing "(...)" metadata
    if (!value) return null;

    const extPattern = FILE_ATTACHMENT_EXTENSIONS.map((ext) =>
      ext.replace('.', '\\.')
    ).join('|');
    const regex = new RegExp(`([A-Za-z0-9_./-]+(?:${extPattern}))`, 'gi');
    const matches = Array.from(value.matchAll(regex));
    if (matches.length === 0) return null;

    let candidate = matches[matches.length - 1]![0];
    if (candidate.toLowerCase().startsWith('description')) {
      const stripped = candidate.slice('description'.length);
      if (/^[A-Za-z0-9]/.test(stripped)) {
        candidate = stripped;
      }
    }
    return candidate;
  };

  const getActiveFilename = () => {
    const selectors = [
      '[role="tab"][aria-selected="true"]',
      '.cm-tab.is-active',
      '.cm-tab[aria-selected="true"]',
      '.cm-tab--active',
      '[data-testid="file-name"]',
      '.file-tree .selected .name',
      '[role="treeitem"][aria-selected="true"]',
      '.file-tree-item.is-selected .file-tree-item-name',
      '.file-tree-item.selected .file-tree-item-name',
      '.cm-tab.selected .cm-tab-label',
      '.cm-tab.active .cm-tab-label',
      '.cm-tab.selected',
      '.cm-tab.active',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const text = el.textContent?.trim();
      if (!text) continue;
      if (text.length > 120) continue;
      const normalized = normalizeFilenameLabel(text);
      if (normalized) return normalized;
    }

    return null;
  };

  const getLineCount = (text: string) => {
    if (!text) return 1;
    return text.split(/\r\n|\r|\n/).length;
  };

  const getFenceLanguage = (filename: string) => {
    const match = filename.match(/\.([a-z0-9]+)$/i);
    if (!match) return '';
    const ext = match[1].toLowerCase();
    if (!ext || ext.length > 10) return '';
    return ext;
  };

  const getSafeMarkdownFence = (content: string) => {
    // If the content includes ``` already (e.g. copying a quote/codeblock), we need a longer fence.
    // We scan for the longest run of backticks and add 1, with a minimum of 3.
    let maxRun = 0;
    let current = 0;
    for (let i = 0; i < content.length; i += 1) {
      if (content[i] === '`') {
        current += 1;
        if (current > maxRun) maxRun = current;
      } else {
        current = 0;
      }
    }
    const fenceLen = Math.max(3, maxRun + 1);
    return '`'.repeat(fenceLen);
  };

  const serializeChipPayload = (payload: ChipPayload) => {
    const label = `[Attachment: ${payload.filename} · ${payload.lineCount} lines]`;
    const language = getFenceLanguage(payload.filename);
    const fence = getSafeMarkdownFence(payload.text);
    const fenceStart = language ? `${fence}${language}` : fence;
    return `\n${label}\n${fenceStart}\n${payload.text}\n${fence}\n`;
  };

  const serializeEditorContent = () => {
    const editor = editorRef.current;
    if (!editor) return { text: '', hasContent: false };

    const parts: string[] = [];
    let hasContent = false;

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = (node.textContent ?? '').replace(/\u200B/g, '');
        if (value.trim()) hasContent = true;
        parts.push(value);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as HTMLElement;
      const chipId = element.dataset?.chipId;
      if (chipId) {
        const payload = chipStoreRef.current[chipId];
        if (payload) {
          hasContent = true;
          parts.push(serializeChipPayload(payload));
        }
        return;
      }
      const mentionKind = element.dataset?.mention;
      if (mentionKind === 'file' || mentionKind === 'folder') {
        const path = element.dataset?.path ?? '';
        if (path) {
          hasContent = true;
          parts.push(`@[${mentionKind}:${path}]`);
        }
        return;
      }

      if (element.tagName === 'BR') {
        parts.push('\n');
        return;
      }

      for (const child of Array.from(element.childNodes)) {
        walk(child);
      }

      if (element.tagName === 'DIV' || element.tagName === 'P') {
        parts.push('\n');
      }
    };

    for (const child of Array.from(editor.childNodes)) {
      walk(child);
    }

    const text = parts.join('');
    return { text: text.trim(), hasContent };
  };

  const clearEditor = () => {
    updateImageAttachments([]);
    updateFileAttachments([]);
    const editor = editorRef.current;
    if (!editor) {
      setEditorEmpty(true);
      return;
    }
    editor.innerHTML = '';
    chipStoreRef.current = {};
    setEditorEmpty(true);
  };

  const syncEditorEmpty = () => {
    const editor = editorRef.current;
    if (!editor) {
      setEditorEmpty(true);
      return;
    }
    const hasChip = !!editor.querySelector('[data-chip-id]');
    const hasMention = !!editor.querySelector('[data-mention]');
    const text = (editor.textContent ?? '').replace(/\u200B/g, '').trim();
    const hasImages = imageAttachmentsRef.current.length > 0;
    const hasFiles = fileAttachmentsRef.current.length > 0;
    setEditorEmpty(
      !hasChip && !hasMention && text.length === 0 && !hasImages && !hasFiles
    );
  };

  const insertNodeAtCursor = (node: Node) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    const selection = window.getSelection();
    if (!selection) {
      editor.appendChild(node);
      syncEditorEmpty();
      return;
    }

    if (!editor.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range) {
      editor.appendChild(node);
      syncEditorEmpty();
      return;
    }

    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    selection.removeAllRanges();
    selection.addRange(range);
    syncEditorEmpty();
  };

  const insertTextAtCursor = (text: string) => {
    if (!text) return;
    insertNodeAtCursor(document.createTextNode(text));
  };

  const insertChipFromText = (
    text: string,
    filenameOverride?: string,
    lineFrom?: number,
    lineTo?: number
  ) => {
    if (!text) return;
    const filename = filenameOverride ?? getActiveFilename() ?? 'snippet.tex';
    const lineCount = getLineCount(text);
    const chipId = createChipId();
    const payload: ChipPayload = {
      text,
      filename,
      lineCount,
      ...(typeof lineFrom === 'number' ? { lineFrom } : {}),
      ...(typeof lineTo === 'number' ? { lineTo } : {}),
    };
    chipStoreRef.current = { ...chipStoreRef.current, [chipId]: payload };

    const preview = (() => {
      const normalized = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();
      if (!normalized) return '';
      const lines = normalized.split('\n');
      const maxLines = 6;
      let value = lines.slice(0, maxLines).join('\n');
      if (lines.length > maxLines) value += '\n…';
      const maxChars = 240;
      if (value.length > maxChars) value = `${value.slice(0, maxChars)}…`;
      return value;
    })();

    const chip = document.createElement('span');
    chip.className = 'ageaf-panel__chip';
    chip.setAttribute('data-chip-id', chipId);
    chip.dataset.chipId = chipId;
    chip.dataset.filename = filename;
    chip.dataset.lines = String(lineCount);
    chip.setAttribute(
      'aria-label',
      `${filename} ${typeof lineFrom === 'number' && typeof lineTo === 'number'
        ? lineFrom === lineTo
          ? lineFrom
          : `${lineFrom}-${lineTo}`
        : lineCount > 1
          ? `1-${lineCount}`
          : '1'
      }`
    );
    chip.setAttribute('contenteditable', 'false');
    if (preview) chip.title = preview;

    const extMatch = filename.match(/\.[a-z0-9]+$/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : '';
    const iconMeta = (() => {
      switch (ext) {
        case '.tex':
          return { label: 'TeX', className: 'tex' };
        case '.md':
          return { label: 'MD', className: 'md' };
        case '.json':
          return { label: '{}', className: 'json' };
        case '.yaml':
        case '.yml':
          return { label: 'YAML', className: 'yaml' };
        case '.csv':
          return { label: 'CSV', className: 'csv' };
        case '.xml':
          return { label: 'XML', className: 'xml' };
        case '.toml':
          return { label: 'TOML', className: 'toml' };
        case '.ini':
          return { label: 'INI', className: 'ini' };
        case '.log':
          return { label: 'LOG', className: 'log' };
        case '.txt':
          return { label: 'TXT', className: 'txt' };
        default:
          return { label: 'FILE', className: 'file' };
      }
    })();

    const hasRange = typeof lineFrom === 'number' && typeof lineTo === 'number';
    const rangeLabel = hasRange
      ? lineFrom === lineTo
        ? `${lineFrom}`
        : `${lineFrom}-${lineTo}`
      : lineCount > 1
        ? `1-${lineCount}`
        : '1';

    const icon = document.createElement('span');
    icon.className = `ageaf-panel__chip-icon ageaf-panel__chip-icon--${iconMeta.className}`;
    icon.textContent = iconMeta.label;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'ageaf-panel__chip-name';
    nameSpan.textContent = filename;

    const rangeSpan = document.createElement('span');
    rangeSpan.className = 'ageaf-panel__chip-range';
    rangeSpan.textContent = rangeLabel;

    chip.append(icon, nameSpan, rangeSpan);
    insertNodeAtCursor(chip);
  };

  const shouldChipPaste = (text: string) => {
    if (text.length > 200) return true;
    return /[\r\n]/.test(text);
  };

  const handlePaste = (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (items && items.length > 0) {
      const files: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length > 0) {
        event.preventDefault();
        void addImagesFromFiles(files, 'paste');
        return;
      }
    }

    const text = event.clipboardData?.getData('text/plain');
    if (text == null) return;
    event.preventDefault();
    if (shouldChipPaste(text)) {
      const bridge = window.ageafBridge;
      if (bridge?.requestSelection) {
        void (async () => {
          try {
            const selection = await bridge.requestSelection();
            const selectedText = selection?.selection ?? '';
            if (selectedText && selectedText.trim()) {
              const activeName = normalizeFilenameLabel(selection?.activeName);
              const lineFrom =
                typeof selection?.lineFrom === 'number'
                  ? selection.lineFrom
                  : undefined;
              const lineTo =
                typeof selection?.lineTo === 'number'
                  ? selection.lineTo
                  : undefined;
              insertChipFromText(
                selectedText,
                activeName ?? undefined,
                lineFrom,
                lineTo
              );
              return;
            }
          } catch {
            // ignore selection errors and fallback to clipboard
          }
          insertChipFromText(text);
        })();
        return;
      }
      insertChipFromText(text);
    } else {
      insertTextAtCursor(text);
    }
  };

  const hasImageTransfer = (transfer: DataTransfer | null) => {
    if (!transfer) return false;
    const items = transfer.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) return true;
      }
    }
    const files = transfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i += 1) {
        if (getImageMediaType(files[i])) return true;
      }
    }
    return false;
  };

  const hasFileTransfer = (transfer: DataTransfer | null) => {
    if (!transfer) return false;
    if (transfer.types && Array.from(transfer.types).includes('Files'))
      return true;
    return Boolean(transfer.files && transfer.files.length > 0);
  };

  const handleDragEnter = (event: DragEvent) => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dropDepthRef.current += 1;
    setIsDropActive(true);
  };

  const handleDragOver = (event: DragEvent) => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (event: DragEvent) => {
    if (!isDropActive) return;
    event.preventDefault();
    event.stopPropagation();
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const { clientX, clientY } = event;
    const outside =
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom;
    if (outside || dropDepthRef.current === 0) {
      setIsDropActive(false);
      dropDepthRef.current = 0;
    }
  };

  const handleDrop = (event: DragEvent) => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dropDepthRef.current = 0;
    setIsDropActive(false);
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const imageFiles = list.filter((file) => getImageMediaType(file));
    const textFiles = list.filter((file) =>
      FILE_ATTACHMENT_EXTENSIONS.includes(getFileExtension(file.name))
    );
    void (async () => {
      if (imageFiles.length > 0) {
        await addImagesFromFiles(imageFiles, 'drop');
      }
      if (textFiles.length > 0) {
        await addDroppedTextFiles(textFiles);
      }
      if (imageFiles.length === 0 && textFiles.length === 0) {
        showAttachmentError('Unsupported file type.');
      }
    })();
  };

  const removeAdjacentChip = (direction: 'backward' | 'forward') => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.isCollapsed) return false;

    let target: HTMLElement | null = null;
    const anchor = selection.anchorNode;
    if (!anchor) return false;

    if (anchor.nodeType === Node.TEXT_NODE) {
      const textNode = anchor as Text;
      const offset = selection.anchorOffset;
      const length = textNode.textContent?.length ?? 0;
      if (direction === 'backward' && offset > 0) return false;
      if (direction === 'forward' && offset < length) return false;
      const sibling =
        direction === 'backward'
          ? textNode.previousSibling
          : textNode.nextSibling;
      if (
        sibling instanceof HTMLElement &&
        (sibling.dataset?.chipId || sibling.dataset?.mention)
      ) {
        target = sibling;
      }
    } else if (anchor.nodeType === Node.ELEMENT_NODE) {
      const element = anchor as HTMLElement;
      const index =
        direction === 'backward'
          ? selection.anchorOffset - 1
          : selection.anchorOffset;
      const sibling = element.childNodes[index];
      if (
        sibling instanceof HTMLElement &&
        (sibling.dataset?.chipId || sibling.dataset?.mention)
      ) {
        target = sibling;
      }
    }

    if (!target) return false;
    const chipId = target.dataset.chipId;
    target.remove();
    if (chipId) {
      const { [chipId]: _removed, ...rest } = chipStoreRef.current;
      chipStoreRef.current = rest;
    }
    syncEditorEmpty();
    return true;
  };

  const insertChipFromSelection = async () => {
    const bridge = window.ageafBridge;
    if (!bridge) return;
    const selection = await bridge.requestSelection();
    const text = selection?.selection ?? '';
    if (!text || !text.trim()) return;
    const activeName = normalizeFilenameLabel(selection?.activeName);
    const lineFrom =
      typeof selection?.lineFrom === 'number' ? selection.lineFrom : undefined;
    const lineTo =
      typeof selection?.lineTo === 'number' ? selection.lineTo : undefined;
    insertChipFromText(text, activeName ?? undefined, lineFrom, lineTo);
  };

  const renderMessageContent = (message: Message) => {
    if (message.patchReview) {
      const patchReview = message.patchReview;
      const status = (patchReview as any).status ?? 'pending';
      const error = patchActionErrors[message.id] ?? null;
      const busy = patchActionBusyId === message.id;
      const canAct = status === 'pending' && !busy;
      const copyId = `${message.id}-patch-proposal`;

      return (
        <PatchReviewCard
          message={message}
          patchReview={patchReview}
          status={status}
          error={error}
          busy={busy}
          canAct={canAct}
          copied={Boolean(copiedItems[copyId])}
          onCopy={() => {
            void (async () => {
              const didCopy = await copyToClipboard(
                'text' in patchReview ? patchReview.text : ''
              );
              if (didCopy) markCopied(copyId);
            })();
          }}
          onAccept={() => void onAcceptPatchReviewMessage(message.id)}
          onFeedback={() => onFeedbackPatchReviewMessage(message.id)}
          onReject={() => onRejectPatchReviewMessage(message.id)}
          markAnimated={() =>
            updatePatchReviewMessage(message.id, (next) => ({
              ...(next as any),
              hasAnimated: true,
            }))
          }
        />
      );
    }

    const fileAttachmentsBlock =
      message.attachments && message.attachments.length > 0 ? (
        <div class="ageaf-message__file-attachments">
          {message.attachments.map((attachment) => (
            <div
              class="ageaf-message__file-chip"
              key={attachment.id}
              title={attachment.path ?? attachment.name}
            >
              <span class="ageaf-message__file-chip-name">
                {truncateName(attachment.name, 28)}
              </span>
              <span class="ageaf-message__file-chip-meta">
                {attachment.ext.replace('.', '').toUpperCase()} ·{' '}
                {formatLineCount(attachment.lineCount)} lines
              </span>
            </div>
          ))}
        </div>
      ) : null;

    const imageAttachmentsBlock =
      message.images && message.images.length > 0 ? (
        <div class="ageaf-message__attachments">
          {message.images.map((image) => (
            <div class="ageaf-message__attachment" key={image.id}>
              <img
                class="ageaf-message__attachment-thumb"
                src={getImageDataUrl(image)}
                alt={image.name}
                loading="lazy"
              />
              <div class="ageaf-message__attachment-meta">
                <div class="ageaf-message__attachment-name">
                  {truncateName(image.name, 28)}
                </div>
                <div class="ageaf-message__attachment-size">
                  {formatBytes(image.size)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null;

    const latestPatchText = (() => {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const patchReview = messages[i]?.patchReview;
        if (!patchReview) continue;
        if ('text' in patchReview && typeof patchReview.text === 'string') {
          return patchReview.text;
        }
      }
      return null;
    })();

    const normalizeForCompare = (value: string) =>
      value
        .replace(/\r\n/g, '\n')
        .trim()
        // make comparison robust to wrapping differences
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n');

    const {
      mainHtml: rawMainHtml,
      quotes,
      interrupted,
    } = extractQuotesFromHtml(renderMarkdown(message.content));
    const mainHtml = decorateMentionsHtml(
      decorateAttachmentLabelsHtml(rawMainHtml)
    );
    const hasMain = mainHtml.trim().length > 0;

    const filteredQuotes =
      latestPatchText && message.role === 'assistant'
        ? quotes.filter((quote) => {
          const copyText = extractCopyTextFromQuoteHtml(quote.html);
          if (!copyText) return true;
          return (
            normalizeForCompare(copyText) !==
            normalizeForCompare(latestPatchText)
          );
        })
        : quotes;

    // If the assistant message is just the proposed patch text (as a LaTeX/code fence),
    // it's redundant with the review card, so skip rendering the message entirely.
    const isRedundantPatchOnlyAssistantMessage =
      message.role === 'assistant' &&
      latestPatchText != null &&
      !hasMain &&
      quotes.length > 0 &&
      filteredQuotes.length === 0 &&
      !fileAttachmentsBlock &&
      !imageAttachmentsBlock;
    if (isRedundantPatchOnlyAssistantMessage) return null;

    return (
      <>
        {fileAttachmentsBlock}
        {imageAttachmentsBlock}
        {hasMain ? (
          <div
            class="ageaf-message__content"
            dangerouslySetInnerHTML={{ __html: mainHtml }}
            onClick={(event) => {
              const target = event.target as HTMLElement | null;

              // Handle diagram download button
              const dlButton = target?.closest?.(
                '[data-diagram-download="true"]'
              ) as HTMLElement | null;
              if (dlButton) {
                event.preventDefault();
                event.stopPropagation();
                const diagram = dlButton.closest('.ageaf-diagram') as HTMLElement | null;
                const svgEl = diagram?.querySelector('.ageaf-diagram__svg svg') as SVGElement | null;
                if (!svgEl) return;
                const svgSource = new XMLSerializer().serializeToString(svgEl);
                const blob = new Blob([svgSource], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'diagram.svg';
                a.click();
                URL.revokeObjectURL(url);
                return;
              }

              // Handle LaTeX copy button
              const button = target?.closest?.(
                '[data-latex-copy="true"]'
              ) as HTMLElement | null;
              if (!button) return;
              event.preventDefault();
              event.stopPropagation();

              const container = button.closest(
                '.ageaf-latex'
              ) as HTMLElement | null;
              const rawLatex = container?.getAttribute('data-latex');
              if (!rawLatex) return;

              const isDisplay =
                container?.classList.contains('ageaf-latex--display') ||
                Boolean(container?.querySelector('.katex-display'));
              const wrapped = isDisplay
                ? `\\[${rawLatex}\\]`
                : `\\(${rawLatex}\\)`;
              void (async () => {
                const success = await copyToClipboard(wrapped);
                if (!success) return;
                // Swap icon to tick for 3s, then revert (since this button is inside injected HTML).
                const existingTimer = latexCopyTimersRef.current.get(button);
                if (existingTimer != null) {
                  window.clearTimeout(existingTimer);
                }

                button.classList.add('is-copied');
                button.textContent = '✓';

                const timeoutId = window.setTimeout(() => {
                  button.classList.remove('is-copied');
                  button.textContent = '⧉';
                  latexCopyTimersRef.current.delete(button);
                }, 3000);
                latexCopyTimersRef.current.set(button, timeoutId);
              })();
            }}
          />
        ) : null}
        {filteredQuotes.length > 0 ? (
          <div class="ageaf-message__quote">
            <div class="ageaf-message__quote-body">
              {filteredQuotes.map((quote, index) => {
                const copyId = `${message.id}-quote-${index}`;
                const copyText = extractCopyTextFromQuoteHtml(quote.html);
                const copyDisabled = !copyText;
                const isCopied = copiedItems[copyId];
                const hasLanguage = Boolean(quote.languageLabel);
                return (
                  <div
                    class="ageaf-message__quote-block"
                    key={`${message.id}-quote-${index}`}
                  >
                    {hasLanguage && (
                      <div class="ageaf-message__quote-lang">
                        {quote.languageLabel}
                      </div>
                    )}
                    <button
                      class={`ageaf-message__copy ${copyDisabled ? 'is-disabled' : ''
                        }`}
                      type="button"
                      aria-label="Copy quote"
                      title="Copy quote"
                      disabled={copyDisabled}
                      onClick={() => {
                        void (async () => {
                          const success = await copyToClipboard(copyText);
                          if (success) markCopied(copyId);
                        })();
                      }}
                    >
                      {isCopied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                    <div
                      class="ageaf-message__quote-content"
                      dangerouslySetInnerHTML={{ __html: quote.html }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {interrupted ? (
          <div class="ageaf-message__interrupt">
            {INTERRUPTED_BY_USER_MARKER}
          </div>
        ) : null}
      </>
    );
  };

  const getKnownModelToken = (text: string | null | undefined) => {
    const normalized = (text ?? '').toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('opus')) return 'opus' as const;
    if (normalized.includes('sonnet')) return 'sonnet' as const;
    if (normalized.includes('haiku')) return 'haiku' as const;
    return null;
  };

  const findRuntimeModel = (token: KnownModelToken) => {
    return runtimeModels.find(
      (model) =>
        getKnownModelToken(model.value) === token ||
        getKnownModelToken(model.displayName) === token
    );
  };

  const getOrderedRuntimeModels = () => {
    const ordered = (['opus', 'sonnet', 'haiku'] as const)
      .map((token) => findRuntimeModel(token))
      .filter((model): model is RuntimeModel => Boolean(model));
    return ordered.length > 0 ? ordered : runtimeModels;
  };

  const getRuntimeModelLabel = (model: RuntimeModel) => {
    const token =
      getKnownModelToken(model.value) ?? getKnownModelToken(model.displayName);
    if (token && token in MODEL_DISPLAY) {
      return MODEL_DISPLAY[token].label;
    }
    const displayName = model.displayName ?? DEFAULT_MODEL_LABEL;
    // Format: gpt -> GPT, codex -> Codex
    return displayName
      .replace(/\bgpt\b/gi, 'GPT')
      .replace(/\bcodex\b/gi, 'Codex');
  };

  const getRuntimeModelDescription = (model: RuntimeModel) => {
    const token =
      getKnownModelToken(model.value) ?? getKnownModelToken(model.displayName);
    if (token && token in MODEL_DISPLAY) {
      return MODEL_DISPLAY[token].description;
    }
    return model.description ?? '';
  };

  const isRuntimeModelSelected = (model: RuntimeModel) => {
    const resolved = currentModel ?? DEFAULT_MODEL_VALUE;
    if (model.value === resolved) return true;
    const currentToken = getKnownModelToken(resolved);
    const modelToken =
      getKnownModelToken(model.value) ?? getKnownModelToken(model.displayName);
    return Boolean(currentToken && modelToken && currentToken === modelToken);
  };

  const getSelectedModelLabel = () => {
    const resolvedModel = currentModel ?? DEFAULT_MODEL_VALUE;
    const resolvedToken = getKnownModelToken(resolvedModel);
    if (resolvedToken && resolvedToken in MODEL_DISPLAY) {
      return MODEL_DISPLAY[resolvedToken].label;
    }
    const match =
      runtimeModels.find((model) => model.value === resolvedModel) ??
      runtimeModels.find(
        (model) =>
          /sonnet/i.test(model.value) || /sonnet/i.test(model.displayName)
      );
    if (match) {
      return getRuntimeModelLabel(match);
    }
    // Format fallback label: gpt -> GPT, codex -> Codex
    return DEFAULT_MODEL_LABEL.replace(/\bgpt\b/gi, 'GPT').replace(
      /\bcodex\b/gi,
      'Codex'
    );
  };

  const getSelectedThinkingMode = () => {
    const match = thinkingModes.find((mode) => mode.id === currentThinkingMode);
    return match ?? thinkingModes[0] ?? FALLBACK_THINKING_MODES[0];
  };

  const persistRuntimeOptions = async (next: Partial<Options>) => {
    const current = settings ?? (await getOptions());
    const updated = { ...current, ...next };
    setSettings(updated);
    try {
      await chrome.storage.local.set({ [LOCAL_STORAGE_KEY_OPTIONS]: updated });
    } catch (error) {
      // Extension context invalidated - ignore silently
      if (
        error instanceof Error &&
        error.message.includes('Extension context invalidated')
      ) {
        return;
      }
      throw error;
    }
  };

  const applyRuntimePreferences = async (payload: {
    model?: string | null;
    thinkingMode?: string | null;
  }) => {
    const options = settings ?? (await getOptions());
    if (options.transport !== 'native' && !options.hostUrl) return;

    try {
      const response = await updateClaudeRuntimePreferences(options, payload);
      if (response.currentModel !== undefined) {
        setCurrentModel(response.currentModel);
      }
      if (response.currentThinkingMode) {
        setCurrentThinkingMode(response.currentThinkingMode);
      }
      if (response.maxThinkingTokens !== undefined) {
        setCurrentThinkingTokens(response.maxThinkingTokens);
      }
    } catch {
      // ignore runtime preference errors to keep UI responsive
    }
  };

  const refreshContextUsage = async (params?: {
    provider?: ProviderId;
    conversationId?: string | null;
    force?: boolean;
  }) => {
    const providerOverride = params?.provider ?? chatProvider;
    const conversationId =
      params?.conversationId ?? chatConversationIdRef.current;
    const state = chatStateRef.current;
    const conversation =
      conversationId && state ? findConversation(state, conversationId) : null;
    const provider = conversation?.provider ?? providerOverride;

    const cached = getCachedStoredUsage(conversation, provider);
    if (cached) {
      setContextUsageFromStored(cached);
    }

    const throttleMs = getContextUsageThrottleMs(provider);
    if (
      !params?.force &&
      cached &&
      Date.now() - cached.updatedAt < throttleMs
    ) {
      return;
    }

    if (contextRefreshInFlightRef.current) return;
    const options = settings ?? (await getOptions());
    if (options.transport !== 'native' && !options.hostUrl) return;
    contextRefreshInFlightRef.current = true;

    try {
      if (provider === 'codex') {
        const threadId = conversation?.providerState?.codex?.threadId;
        const usage = await fetchCodexRuntimeContextUsage(options, {
          threadId,
        });
        if (
          usage.contextWindow ||
          usage.usedTokens > 0 ||
          usage.percentage !== null
        ) {
          const normalized = normalizeContextUsage({
            usedTokens: usage.usedTokens,
            contextWindow: usage.contextWindow,
            percentage: usage.percentage,
          });
          const nextUsage: StoredContextUsage = {
            usedTokens: normalized.usedTokens,
            contextWindow: normalized.contextWindow,
            percentage: normalized.percentage ?? null,
            updatedAt: Date.now(),
          };
          const latestState = chatStateRef.current;
          if (conversationId && latestState) {
            chatStateRef.current = setConversationContextUsage(
              latestState,
              provider,
              conversationId,
              nextUsage
            );
            scheduleChatSave();
          }
          if (chatConversationIdRef.current === conversationId) {
            setContextUsage(
              normalizeContextUsage({
                usedTokens: nextUsage.usedTokens,
                contextWindow: nextUsage.contextWindow,
                percentage: nextUsage.percentage,
              })
            );
          }
        }
        return;
      }

      const usage = await fetchClaudeRuntimeContextUsage(options);
      if (
        usage.contextWindow ||
        usage.usedTokens > 0 ||
        usage.percentage !== null
      ) {
        const normalized = normalizeContextUsage({
          usedTokens: usage.usedTokens,
          contextWindow: usage.contextWindow,
          percentage: usage.percentage,
        });
        const nextUsage: StoredContextUsage = {
          usedTokens: normalized.usedTokens,
          contextWindow: normalized.contextWindow,
          percentage: normalized.percentage ?? null,
          updatedAt: Date.now(),
        };
        const latestState = chatStateRef.current;
        if (conversationId && latestState) {
          chatStateRef.current = setConversationContextUsage(
            latestState,
            provider,
            conversationId,
            nextUsage
          );
          scheduleChatSave();
        }
        if (chatConversationIdRef.current === conversationId) {
          setContextUsage(
            normalizeContextUsage({
              usedTokens: nextUsage.usedTokens,
              contextWindow: nextUsage.contextWindow,
              percentage: nextUsage.percentage,
            })
          );
        }
      }
    } catch {
      // ignore context usage errors
    } finally {
      contextRefreshInFlightRef.current = false;
    }
  };

  const onSelectModel = async (model: string) => {
    setCurrentModel(model);
    if (chatProvider === 'codex') {
      const selectedModel =
        runtimeModels.find((entry) => entry.value === model) ??
        runtimeModels.find((entry) => entry.isDefault) ??
        runtimeModels[0] ??
        null;
      const supportedEfforts: Array<{
        reasoningEffort: string;
        description: string;
      }> = selectedModel?.supportedReasoningEfforts ?? [];
      const supportedModes = new Set(
        supportedEfforts.map(
          (entry: { reasoningEffort: string; description: string }) =>
            getThinkingModeIdForCodexEffort(String(entry.reasoningEffort ?? ''))
        )
      );
      const nextThinkingModes = FALLBACK_THINKING_MODES.map((mode) => ({
        ...mode,
        maxThinkingTokens: null,
      })).filter((mode) => supportedModes.has(mode.id));
      setThinkingModes(
        nextThinkingModes.length > 0
          ? nextThinkingModes
          : FALLBACK_THINKING_MODES
      );
      const defaultMode = getThinkingModeIdForCodexEffort(
        selectedModel?.defaultReasoningEffort
      );
      const nextMode = supportedModes.has(currentThinkingMode)
        ? currentThinkingMode
        : defaultMode;
      setCurrentThinkingMode(nextMode);
      setCurrentThinkingTokens(null);
      setContextUsage(null);
      void refreshContextUsage();
      return;
    }
    await persistRuntimeOptions({ claudeModel: model });
    await applyRuntimePreferences({ model });
    void refreshContextUsage();
  };

  const onSelectThinkingMode = async (modeId: string) => {
    const mode =
      thinkingModes.find((entry) => entry.id === modeId) ??
      FALLBACK_THINKING_MODES.find((entry) => entry.id === modeId);
    const maxThinkingTokens = mode?.maxThinkingTokens ?? null;
    setCurrentThinkingMode(modeId);
    setCurrentThinkingTokens(maxThinkingTokens);
    if (chatProvider === 'codex') {
      return;
    }
    await persistRuntimeOptions({
      claudeThinkingMode: modeId,
      claudeMaxThinkingTokens: maxThinkingTokens,
    });
    await applyRuntimePreferences({ thinkingMode: modeId });
  };

  const onToggleYoloMode = async () => {
    const next = !yoloMode;
    setYoloMode(next);
    if (chatProvider === 'codex') {
      await persistRuntimeOptions({
        openaiApprovalPolicy: next ? 'never' : 'on-request',
      });
      return;
    }
    await persistRuntimeOptions({ claudeYoloMode: next });
  };

  // Helper to merge stored env vars with ephemeral API key
  const buildEnvVarsWithApiKey = (
    storedEnvVars: string | undefined,
    apiKey: string,
    keyVarName: string
  ): string => {
    // If no API key provided in UI, just return stored env vars
    if (!apiKey) {
      return storedEnvVars || '';
    }

    // Merge: API key takes precedence
    const lines = (storedEnvVars || '').split('\n').filter((line) => {
      const trimmed = line.trim();
      // Remove any existing API_KEY lines from stored vars
      return (
        !trimmed.startsWith('ANTHROPIC_API_KEY=') &&
        !trimmed.startsWith('OPENAI_API_KEY=')
      );
    });

    // Add API key at the beginning
    lines.unshift(`${keyVarName}=${apiKey}`);

    return lines.join('\n');
  };

  const getRuntimeConfig = async () => {
    const options = await getOptions();
    if (chatProvider === 'codex') {
      const conversationId = chatConversationIdRef.current;
      const state = chatStateRef.current;
      const conversation =
        conversationId && state
          ? findConversation(state, conversationId)
          : null;
      const codexThreadId = conversation?.providerState?.codex?.threadId;
      const codexModelCandidate = currentModel ?? null;
      const codexRuntimeModel =
        (codexModelCandidate
          ? runtimeModels.find((entry) => entry.value === codexModelCandidate)
          : null) ??
        runtimeModels.find((entry) => entry.isDefault) ??
        runtimeModels.find(
          (entry) => entry.supportedReasoningEfforts !== undefined
        ) ??
        runtimeModels[0] ??
        null;
      const codexModel =
        codexRuntimeModel?.supportedReasoningEfforts !== undefined
          ? codexRuntimeModel.value
          : null;
      const codexEffort = codexModel
        ? getCodexEffortForThinkingMode(
          currentThinkingMode as ThinkingMode['id'],
          codexRuntimeModel ?? null
        ) ??
        codexRuntimeModel?.defaultReasoningEffort ??
        null
        : null;
      // Build env vars with ephemeral API key if provided
      const runtimeEnvVars = buildEnvVarsWithApiKey(
        options.openaiEnvVars,
        openaiApiKey,
        'OPENAI_API_KEY'
      );
      return {
        codex: {
          cliPath: options.openaiCodexCliPath,
          envVars: runtimeEnvVars,
          approvalPolicy: options.openaiApprovalPolicy,
          ...(codexModel ? { model: codexModel } : {}),
          ...(codexEffort ? { reasoningEffort: codexEffort } : {}),
          ...(codexThreadId ? { threadId: codexThreadId } : {}),
        },
      };
    } else {
      const runtimeModel =
        currentModel ?? options.claudeModel ?? DEFAULT_MODEL_VALUE;
      const runtimeThinkingTokens =
        currentThinkingTokens ?? options.claudeMaxThinkingTokens ?? null;
      const conversationId = chatConversationIdRef.current;
      // Build env vars with ephemeral API key if provided
      const runtimeEnvVars = buildEnvVarsWithApiKey(
        options.claudeEnvVars,
        claudeApiKey,
        'ANTHROPIC_API_KEY'
      );
      return {
        claude: {
          cliPath: options.claudeCliPath,
          envVars: runtimeEnvVars,
          loadUserSettings: options.claudeLoadUserSettings,
          model: runtimeModel ?? undefined,
          maxThinkingTokens: runtimeThinkingTokens ?? undefined,
          sessionScope: 'project' as const,
          yoloMode,
          conversationId: conversationId ?? undefined,
        },
      };
    }
  };

  const thinkingEnabled = currentThinkingMode !== 'off';

  const formatElapsed = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(
        secs
      ).padStart(2, '0')}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${String(secs).padStart(2, '0')}s`;
    }
    return `${secs}s`;
  };

  const formatStreamingStatusLine = (
    prefix: string,
    seconds: number | null
  ) => {
    const trimmed = prefix.trim();
    if (!trimmed) return null;
    if (!thinkingEnabled || seconds === null) {
      return `${trimmed} · ESC to interrupt`;
    }
    const elapsed = formatElapsed(seconds);
    if (trimmed.toLowerCase() === 'thinking') {
      return `Thinking ${elapsed} · ESC to interrupt`;
    }
    return `${trimmed} · ${elapsed} · ESC to interrupt`;
  };

  const stopThinkingTimer = (conversationId: string) => {
    const sessionState = getSessionState(conversationId);
    if (sessionState.thinkingTimerId !== null) {
      window.clearInterval(sessionState.thinkingTimerId);
      sessionState.thinkingTimerId = null;
    }
  };

  const startThinkingTimer = (conversationId: string) => {
    stopThinkingTimer(conversationId);
    const sessionState = getSessionState(conversationId);
    sessionState.thinkingStartTime = Date.now();
    sessionState.thinkingComplete = false;
    sessionState.statusPrefix = thinkingEnabled ? 'Thinking' : 'Working';

    // Only update UI if this is the current session
    if (conversationId === chatConversationIdRef.current) {
      const status = formatStreamingStatusLine(
        sessionState.statusPrefix,
        thinkingEnabled ? 0 : null
      );
      if (status) setStreamingState(status, true);
    }

    if (!thinkingEnabled) return;

    sessionState.thinkingTimerId = window.setInterval(() => {
      if (!sessionState.activityStartTime) return;
      const seconds = Math.max(
        0,
        Math.floor((Date.now() - sessionState.activityStartTime) / 1000)
      );

      // Only update UI if this is still the current session
      if (conversationId === chatConversationIdRef.current) {
        const prefix = sessionState.statusPrefix ?? 'Thinking';
        const status = formatStreamingStatusLine(prefix, seconds);
        if (status) setStreamingStatus(status);
      }
    }, 250);
  };

  const markThinkingComplete = (conversationId: string) => {
    const sessionState = getSessionState(conversationId);
    if (sessionState.thinkingComplete) return;
    sessionState.thinkingComplete = true;

    let thinkingSeconds = 0;
    if (sessionState.activityStartTime) {
      thinkingSeconds = Math.max(
        0,
        Math.floor((Date.now() - sessionState.activityStartTime) / 1000)
      );
    }

    stopThinkingTimer(conversationId);

    // Only update UI if this is the current session
    if (conversationId === chatConversationIdRef.current) {
      if (!thinkingEnabled) {
        setStreamingStatus('Responding · ESC to interrupt');
      } else {
        setStreamingStatus(
          `Thought for ${thinkingSeconds}s · ESC to interrupt`
        );
      }
    }
  };

  const stopStreamTimer = (conversationId: string) => {
    const sessionState = getSessionState(conversationId);
    if (sessionState.streamTimerId !== null) {
      window.clearInterval(sessionState.streamTimerId);
      sessionState.streamTimerId = null;
    }
  };

  const maybeFinalizeStream = (
    conversationId: string,
    provider: ProviderId
  ) => {
    const sessionState = getSessionState(conversationId);
    if (!sessionState.pendingDone) return;
    if (sessionState.streamTokens.length > 0) return;

    const pending = sessionState.pendingDone;
    sessionState.pendingDone = null;
    const finalText = sessionState.streamingText.trim();
    // Clear buffer so it can't be reused for the next reply.
    sessionState.streamingText = '';
    stopThinkingTimer(conversationId);

    let thinkingSeconds = 0;
    if (sessionState.activityStartTime) {
      thinkingSeconds = Math.max(
        0,
        Math.floor((Date.now() - sessionState.activityStartTime) / 1000)
      );
    }
    const statusLine = thinkingEnabled
      ? `Thought for ${thinkingSeconds}s`
      : undefined;
    sessionState.activityStartTime = null;

    // Always persist messages to stored conversation (even if background)
    const state = chatStateRef.current;
    if (state) {
      const conversation = findConversation(state, conversationId);
      if (conversation) {
        let updatedMessages = [...conversation.messages];

        // Capture streaming thinking before clearing        // If we have streaming thinking/cot, persist it
        if (streamingCoTRef.current.length > 0) {
          completeLastTool(streamingCoTRef.current);
        }
        const thinkingToPersist = streamingThinkingRef.current
          ? [streamingThinkingRef.current]
          : undefined;
        const cotToPersist =
          streamingCoTRef.current.length > 0
            ? [...streamingCoTRef.current]
            : undefined;

        const shouldSkipEmptyOkMessage =
          pending.status === 'ok' &&
          !finalText &&
          !pending.message &&
          (sessionState.didReceivePatch ||
            sessionState.pendingPatchReviewMessages.length > 0);

        const responseContent =
          pending.status === 'ok'
            ? finalText || pending.message || ''
            : pending.message ?? `Job failed (${pending.status})`;

        if (!shouldSkipEmptyOkMessage) {
          const content =
            pending.status === 'ok' && !responseContent
              ? 'Job completed with no output.'
              : responseContent;

          updatedMessages.push({
            role: pending.status === 'ok' ? 'assistant' : 'system',
            content,
            ...(statusLine ? { statusLine } : {}),
            ...(thinkingToPersist ? { thinking: thinkingToPersist } : {}),
            ...(cotToPersist ? { cot: cotToPersist } : {}),
          });
        }

        // Reset
        streamingThinkingRef.current = '';
        streamingCoTRef.current = [];
        const sessionConversationId = chatConversationIdRef.current; // Capture for stable closure
        if (sessionConversationId === chatConversationIdRef.current) {
          setStreamingThinking('');
          setStreamingCoT([]);
        }

        if (pending.status === 'ok') {
          if (sessionState.pendingPatchReviewMessages.length > 0) {
            updatedMessages.push(...sessionState.pendingPatchReviewMessages);
            sessionState.pendingPatchReviewMessages = [];
          }
        } else {
          sessionState.pendingPatchReviewMessages = [];
        }

        chatStateRef.current = setConversationMessages(
          state,
          conversation.provider,
          conversationId,
          updatedMessages
        );
        scheduleChatSave();

        // Only update UI if this is the current session
        if (conversationId === chatConversationIdRef.current) {
          setMessages(updatedMessages.map((m) => createMessage(m)));
          setStreamingText('');
          setStreamingThinking('');
          streamingTextRef.current = '';
          streamingThinkingRef.current = '';
          stopStreamTimer(conversationId);
          setStreamingState(null, false);

          if (provider === 'claude') {
            void refreshContextUsage();
          }
        }
      }
    }

    finishSessionJob(conversationId);
  };

  const startStreamTimer = (conversationId: string, provider: ProviderId) => {
    const sessionState = getSessionState(conversationId);
    if (sessionState.streamTimerId !== null) return;

    sessionState.streamTimerId = window.setInterval(() => {
      if (sessionState.streamTokens.length === 0) {
        if (sessionState.pendingDone) {
          maybeFinalizeStream(conversationId, provider);
        } else {
          stopStreamTimer(conversationId);
        }
        return;
      }
      const next = sessionState.streamTokens.shift();
      if (!next) return;
      sessionState.streamingText += next;

      // Only update UI if this is the current session
      if (conversationId === chatConversationIdRef.current) {
        streamingTextRef.current = sessionState.streamingText;
        setStreamingText(sessionState.streamingText);
      }
    }, 30);
  };

  const enqueueStreamTokens = (
    conversationId: string,
    provider: ProviderId,
    text: string
  ) => {
    const sessionState = getSessionState(conversationId);
    const tokens = text.match(/\s+|[^\s]+/g) ?? [text];
    sessionState.streamTokens.push(...tokens);
    startStreamTimer(conversationId, provider);
  };

  const setSending = (value: boolean) => {
    isSendingRef.current = value;
    setIsSending(value);
  };

  const enqueueMessage = (
    conversationId: string,
    text: string,
    images?: ImageAttachment[],
    attachments?: FileAttachment[],
    patchFeedbackTarget?: PatchFeedbackTarget
  ) => {
    const sessionState = getSessionState(conversationId);
    sessionState.queue.push({
      text,
      images,
      attachments,
      patchFeedbackTarget,
      timestamp: Date.now(),
    });

    // Update queue count for current session
    if (conversationId === chatConversationIdRef.current) {
      queueRef.current.push({ text, images, attachments, patchFeedbackTarget });
      setQueueCount(sessionState.queue.length);
    }
  };

  const dequeueMessage = (conversationId: string) => {
    const sessionState = getSessionState(conversationId);
    const next = sessionState.queue.shift();

    // Update queue count for current session
    if (conversationId === chatConversationIdRef.current) {
      const nextGlobal = queueRef.current.shift();
      setQueueCount(sessionState.queue.length);
    }

    return next;
  };

  const finishSessionJob = (conversationId: string) => {
    const sessionState = getSessionState(conversationId);

    // Clear job state
    sessionState.isSending = false; // FIX: Must clear sending state
    sessionState.abortController = null;
    sessionState.activeJobId = null;
    sessionState.interrupted = false;
    sessionState.thinkingComplete = false;

    // Update UI if this is the current session
    if (conversationId === chatConversationIdRef.current) {
      abortControllerRef.current = null;
      activeJobIdRef.current = null;
      interruptedRef.current = false;
      thinkingCompleteRef.current = false;
      setToolRequests([]);
      setToolRequestInputs({});
      setToolRequestBusy(false);
      setSending(false);
    }

    // Process next queued message for this session
    // NOTE: sendMessage will read current session refs, so only process queue if this IS the current session
    const next = dequeueMessage(conversationId);
    if (next && conversationId === chatConversationIdRef.current) {
      void sendMessage(
        next.text,
        next.images ?? [],
        next.attachments ?? [],
        'chat',
        next.patchFeedbackTarget
      );
    }
  };

  // Legacy wrapper for backward compatibility
  const finishJob = () => {
    const conversationId = chatConversationIdRef.current;
    if (conversationId) {
      finishSessionJob(conversationId);
    }
  };

  function interruptCurrentSession() {
    const conversationId = chatConversationIdRef.current;
    if (!conversationId) return;

    const sessionState = getSessionState(conversationId);
    if (sessionState.interrupted) return;
    if (!sessionState.isSending && sessionState.streamTimerId == null) return;

    sessionState.interrupted = true;
    sessionState.isSending = false;
    const controller = sessionState.abortController;

    // Cleanup timers
    stopThinkingTimer(conversationId);
    stopStreamTimer(conversationId);

    // IMPORTANT: Flush any remaining buffered tokens before clearing
    // (tokens are buffered and flushed every 30ms, so there may be unflushed tokens)
    const remainingTokens = sessionState.streamTokens.join('');
    sessionState.streamingText += remainingTokens;
    sessionState.streamTokens = [];
    sessionState.pendingDone = null;
    sessionState.pendingPatchReviewMessages = [];

    // Update UI
    interruptedRef.current = true;
    setSending(false);
    streamTokensRef.current = [];
    pendingDoneRef.current = null;
    clearPatchActionState();
    setToolRequests([]);
    setToolRequestInputs({});
    setToolRequestBusy(false);
    activeJobIdRef.current = null;
    sessionState.activeJobId = null;

    // Close any unclosed code fences before adding the interruption marker
    const partial = closeUnfinishedCodeFences(
      sessionState.streamingText.trim()
    );
    const content = partial
      ? `${partial}\n\n${INTERRUPTED_BY_USER_MARKER}`
      : INTERRUPTED_BY_USER_MARKER;
    setMessages((prev) => [
      ...prev,
      createMessage({ role: 'assistant', content }),
    ]);

    setStreamingText('');
    setStreamingThinking('');
    streamingTextRef.current = '';
    streamingThinkingRef.current = '';
    sessionState.streamingText = '';
    setStreamingState(null, false);

    // Abort the job
    controller?.abort();
    sessionState.abortController = null;
    abortControllerRef.current = null;

    if (!controller) {
      finishSessionJob(conversationId);
    }
  }

  // Legacy wrapper for backward compatibility
  function interruptInFlightJob() {
    interruptCurrentSession();
  }

  const sendMessage = async (
    text: string,
    images: ImageAttachment[] = [],
    attachments: FileAttachment[] = [],
    action: JobAction = 'chat',
    patchFeedbackTarget?: PatchFeedbackTarget
  ) => {
    const bridge = window.ageafBridge;
    if (!bridge) return;

    const conversationId = chatConversationIdRef.current;
    if (!conversationId) return;

    // TypeScript: conversationId is guaranteed non-null from this point
    const sessionConversationId: string = conversationId;
    const provider = chatProvider;
    const sessionState = getSessionState(sessionConversationId);
    let patchFeedbackTargetActive =
      patchFeedbackTarget &&
        patchFeedbackTarget.conversationId === sessionConversationId
        ? patchFeedbackTarget
        : null;

    // Update session state
    sessionState.isSending = true;
    sessionState.interrupted = false;
    sessionState.didReceivePatch = false;
    sessionState.activityStartTime = Date.now();
    sessionState.pendingDone = null;
    sessionState.pendingPatchReviewMessages = [];
    // IMPORTANT: Reset streaming buffers so previous replies can't leak into this reply.
    stopStreamTimer(sessionConversationId);
    sessionState.streamTokens = [];
    sessionState.streamingText = '';

    const abortController = new AbortController();
    sessionState.abortController = abortController;

    const messageImages = images.length > 0 ? images : undefined;
    const messageAttachments = attachments.length > 0 ? attachments : undefined;
    // Update UI for current session
    setMessages((prev) => [
      ...prev,
      createMessage({
        role: 'user',
        content: text,
        ...(messageImages ? { images: messageImages } : {}),
        ...(messageAttachments ? { attachments: messageAttachments } : {}),
      }),
    ]);
    // Scroll to bottom after the message is added to the DOM
    requestAnimationFrame(() => {
      scrollToBottom();
    });
    setSending(true);
    clearPatchActionState();
    setStreamingText('');
    setStreamingThinking('');
    streamingTextRef.current = '';
    streamingThinkingRef.current = '';
    streamTokensRef.current = [];
    pendingDoneRef.current = null;
    activityStartRef.current = Date.now();
    interruptedRef.current = false;
    abortControllerRef.current = abortController;

    startThinkingTimer(sessionConversationId);

    const resolveMentionFiles = async (rawText: string) => {
      const fileRegex = /@\[file:([^\]]+)\]/g;
      const folderRegex = /@\[folder:([^\]]+)\]/g;
      const fileRefs = Array.from(rawText.matchAll(fileRegex))
        .map((m) => String(m[1] ?? '').trim())
        .filter(Boolean);
      const folderRefs = Array.from(rawText.matchAll(folderRegex))
        .map((m) => String(m[1] ?? '').trim())
        .filter(Boolean);
      if (fileRefs.length === 0 && folderRefs.length === 0) return rawText;

      const MAX_CHARS = 200_000;
      const MAX_FILES_PER_FOLDER = 5;
      const projectId = getOverleafProjectIdFromPathname(
        window.location.pathname
      );
      const fileContentCache = new Map<string, string>();

      const normalizeMentionRef = (ref: string) => {
        let s = ref.trim();
        if (!s) return '';
        s = s.replace(/\*+$/, '').trim();
        if (s.includes('/')) s = s.split('/').filter(Boolean).pop() ?? s;
        return s;
      };

      const findDocIdForRef = (ref: string) => {
        const want = normalizeMentionRef(ref).toLowerCase();
        if (!want) return null;
        const nodes = Array.from(
          document.querySelectorAll('[data-file-id][data-file-type="doc"]')
        );
        for (const node of nodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.closest('#ageaf-panel-root')) continue;
          const treeItem = node.closest(
            '[role="treeitem"]'
          ) as HTMLElement | null;
          const name = (
            treeItem?.getAttribute('aria-label') ??
            treeItem?.textContent ??
            ''
          ).trim();
          if (!name) continue;
          if (name.trim().toLowerCase() !== want) continue;
          const id = node.getAttribute('data-file-id')?.trim();
          if (id) return id;
        }
        return null;
      };

      const fetchDocDownload = async (docId: string) => {
        if (!projectId) throw new Error('Missing project id');
        // Try both route casings to be robust.
        const candidates = [
          `/Project/${encodeURIComponent(projectId)}/doc/${encodeURIComponent(
            docId
          )}/download`,
          `/project/${encodeURIComponent(projectId)}/doc/${encodeURIComponent(
            docId
          )}/download`,
        ];
        let lastErr: unknown = null;
        for (const url of candidates) {
          try {
            const resp = await fetch(url, { credentials: 'include' });
            if (!resp.ok) {
              lastErr = new Error(`HTTP ${resp.status}`);
              continue;
            }
            return await resp.text();
          } catch (err) {
            lastErr = err;
          }
        }
        throw lastErr instanceof Error
          ? lastErr
          : new Error('Doc download failed');
      };

      const langForExt = (name: string) => {
        const ext = getFileExtension(name);
        if (ext === '.tex') return 'tex';
        if (ext === '.bib') return 'bibtex';
        if (ext === '.md') return 'markdown';
        if (ext === '.json') return 'json';
        if (ext === '.yaml' || ext === '.yml') return 'yaml';
        if (ext === '.csv') return 'csv';
        if (ext === '.xml') return 'xml';
        return 'text';
      };

      /**
       * Fetch the content of an Overleaf doc by its project file path.
       * Returns the content string, or null if fetch fails.
       */
      const fetchFileContent = async (
        filePath: string
      ): Promise<string | null> => {
        const cached = fileContentCache.get(filePath);
        if (cached != null) return cached;
        const docId = findDocIdForRef(filePath);
        if (projectId && docId) {
          try {
            const content = await fetchDocDownload(docId);
            fileContentCache.set(filePath, content);
            return content;
          } catch {
            // fall through
          }
        }
        return null;
      };

      /**
       * Wrap file content into an [Overleaf file:] markdown block,
       * applying truncation if necessary.
       */
      const wrapFileBlock = (name: string, content: string): string => {
        let body = content;
        if (body.length > MAX_CHARS) {
          const head = body.slice(0, Math.floor(MAX_CHARS * 0.7));
          const tail = body.slice(-Math.floor(MAX_CHARS * 0.3));
          body = `${head}\n\n… [truncated ${body.length - (head.length + tail.length)
            } chars] …\n\n${tail}`;
        }
        const lang = langForExt(name);
        return `\n\n[Overleaf file: ${name}]\n\`\`\`${lang}\n${body}\n\`\`\`\n`;
      };

      /**
       * Fetch raw file content by ref. Returns null if unavailable.
       */
      const fetchRawContent = async (ref: string): Promise<string | null> => {
        const cached = fileContentCache.get(ref);
        if (cached != null) return cached;

        const docId = findDocIdForRef(ref);
        if (projectId && docId) {
          try {
            const content = await fetchDocDownload(docId);
            fileContentCache.set(ref, content);
            return content;
          } catch {
            // Fall through to bridge below.
          }
        }

        if (!bridge.requestFileContent) return null;
        const resp = await bridge
          .requestFileContent(ref)
          .catch((err: unknown) => ({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            content: '',
            activeName: null,
            name: ref,
          }));
        const content = typeof resp?.content === 'string' ? resp.content : '';
        const requested = typeof resp?.name === 'string' ? resp.name : ref;
        const normalizedRequested =
          normalizeMentionRef(requested).toLowerCase();
        const normalizedActive = normalizeMentionRef(
          String(resp?.activeName ?? '')
        ).toLowerCase();
        const activeMatches =
          !!normalizedRequested && normalizedActive === normalizedRequested;
        const ok = !!resp?.ok && content.length > 0 && activeMatches;
        if (!ok) return null;
        fileContentCache.set(ref, content);
        return content;
      };

      const resolveFile = async (ref: string) => {
        const raw = await fetchRawContent(ref);
        if (raw == null) {
          return `\n\n[Overleaf file: ${ref}]\n(Unable to read file content from Overleaf editor.)\n`;
        }
        // For .tex files, inline-expand all \input{}/\include{} directives
        // so the CLI receives one complete merged document.
        if (getFileExtension(ref).toLowerCase() === '.tex') {
          const projectFiles: ProjectFile[] = projectFilesRef.current
            .filter((e) => e.kind !== 'folder')
            .map((e) => ({ path: e.path, name: e.name }));
          const expanded = await expandLatexIncludes(
            raw,
            fetchFileContent,
            projectFiles,
            ref
          );
          return wrapFileBlock(ref, expanded);
        }
        return wrapFileBlock(ref, raw);
      };

      let nextText = rawText;
      for (const ref of fileRefs) {
        // eslint-disable-next-line no-await-in-loop
        const injection = await resolveFile(ref);
        const token = `@[file:${ref}]`;
        nextText = nextText.split(token).join(injection);
      }

      for (const folder of folderRefs) {
        const folderKey = folder.toLowerCase();
        const candidates = projectFilesRef.current
          .filter((entry) => entry.kind !== 'folder')
          .filter((entry) => {
            const path = entry.path.toLowerCase();
            if (path.startsWith(`${folderKey}/`)) return true;
            if (path.startsWith(folderKey) && path.includes('/')) return true;
            return false;
          })
          .slice(0, MAX_FILES_PER_FOLDER);

        let folderBlock = `\n\n[Overleaf folder: ${folder}]\n`;
        if (candidates.length === 0) {
          folderBlock +=
            '(No files found under this folder from the current project list.)\n';
        } else {
          folderBlock += `Files (${candidates.length}):\n`;
          for (const entry of candidates) {
            folderBlock += `- ${entry.path}\n`;
          }
          for (const entry of candidates) {
            // eslint-disable-next-line no-await-in-loop
            const injection = await resolveFile(entry.path || entry.name);
            folderBlock += injection;
          }
        }
        const token = `@[folder:${folder}]`;
        nextText = nextText.split(token).join(folderBlock);
      }
      return nextText;
    };

    try {
      const selection = await bridge.requestSelection();
      const resolvedMessageText = await resolveMentionFiles(text);

      // Auto-invoke humanizer skill for writing/editing actions
      const autoInvokeHumanizer = (messageText: string): string => {
        // Check if user explicitly opted out
        const optOutPatterns =
          /(?:don't|do not|without|skip|no)\s+(?:humanizer|humanize)/i;
        if (optOutPatterns.test(messageText)) {
          return messageText;
        }

        // Check if humanizer is already invoked
        if (/\/humanizer/.test(messageText)) {
          return messageText;
        }

        // Do not auto-invoke humanizer if the user already has an
        // explicit skill directive (e.g. /paper-reviewer, /commit).
        if (/(^|[\s([{])\/[A-Za-z0-9._-]+/.test(messageText)) {
          return messageText;
        }

        // Check for rewrite/editing keywords
        const triggerKeywords =
          /\b(proofread|paraphrase|rewrite|rephrase|write|edit|refine|improve)\b/i;
        const hasSelection =
          selection &&
          typeof selection.text === 'string' &&
          selection.text.trim().length > 0;

        // Auto-invoke for rewrite selection or when trigger keywords are present
        if (
          action === 'rewrite' ||
          (hasSelection && triggerKeywords.test(messageText)) ||
          triggerKeywords.test(messageText)
        ) {
          return `/humanizer ${messageText}`;
        }

        return messageText;
      };

      const messageWithAutoSkills = autoInvokeHumanizer(resolvedMessageText);
      const { skillsPrompt, strippedText } = await processSkillDirectives(
        messageWithAutoSkills
      );
      const finalMessageText = strippedText;
      const options = await getOptions();
      const runtimeModel =
        currentModel ?? options.claudeModel ?? DEFAULT_MODEL_VALUE;
      const runtimeThinkingTokens =
        currentThinkingTokens ?? options.claudeMaxThinkingTokens ?? null;
      const state = chatStateRef.current;
      const conversation = state
        ? findConversation(state, sessionConversationId)
        : null;
      const codexThreadId =
        provider === 'codex'
          ? conversation?.providerState?.codex?.threadId
          : undefined;
      const codexModelCandidate =
        provider === 'codex' ? currentModel ?? null : null;
      const codexRuntimeModel =
        provider === 'codex'
          ? (codexModelCandidate
            ? runtimeModels.find(
              (entry) => entry.value === codexModelCandidate
            )
            : null) ??
          runtimeModels.find((entry) => entry.isDefault) ??
          runtimeModels.find(
            (entry) => entry.supportedReasoningEfforts !== undefined
          ) ??
          runtimeModels[0] ??
          null
          : null;
      const codexModel =
        provider === 'codex' &&
          codexRuntimeModel?.supportedReasoningEfforts !== undefined
          ? codexRuntimeModel.value
          : null;
      const codexEffort =
        provider === 'codex' && codexModel
          ? getCodexEffortForThinkingMode(
            currentThinkingMode as ThinkingMode['id'],
            codexRuntimeModel
          ) ??
          codexRuntimeModel?.defaultReasoningEffort ??
          null
          : null;
      const payload =
        provider === 'codex'
          ? {
            provider: 'codex' as const,
            action,
            runtime: {
              codex: {
                cliPath: options.openaiCodexCliPath,
                envVars: options.openaiEnvVars,
                approvalPolicy: options.openaiApprovalPolicy,
                ...(codexModel ? { model: codexModel } : {}),
                ...(codexEffort ? { reasoningEffort: codexEffort } : {}),
                ...(codexThreadId ? { threadId: codexThreadId } : {}),
              },
            },
            overleaf: { url: window.location.href },
            context: {
              message: finalMessageText,
              selection: selection?.selection ?? '',
              surroundingBefore: selection?.before ?? '',
              surroundingAfter: selection?.after ?? '',
              ...(messageImages
                ? {
                  images: messageImages.map((image) => ({
                    id: image.id,
                    name: image.name,
                    mediaType: image.mediaType,
                    data: image.data,
                    size: image.size,
                  })),
                }
                : {}),
              ...(messageAttachments
                ? {
                  attachments: messageAttachments.map((attachment) => ({
                    id: attachment.id,
                    path: attachment.path,
                    name: attachment.name,
                    ext: attachment.ext,
                    sizeBytes: attachment.sizeBytes,
                    lineCount: attachment.lineCount,
                    content: attachment.content,
                  })),
                }
                : {}),
            },
            policy: {
              requireApproval: false,
              allowNetwork: false,
              maxFiles: 1,
            },
            userSettings: {
              displayName: options.displayName,
              customSystemPrompt: skillsPrompt
                ? `${options.customSystemPrompt || ''}\n\n${skillsPrompt}`
                : options.customSystemPrompt,
              autoCompactEnabled: options.autoCompactEnabled,
              debugCliEvents: options.debugCliEvents,
            },
          }
          : {
            provider: 'claude' as const,
            action,
            runtime: {
              claude: {
                cliPath: options.claudeCliPath,
                envVars: options.claudeEnvVars,
                loadUserSettings: options.claudeLoadUserSettings,
                model: runtimeModel ?? undefined,
                maxThinkingTokens: runtimeThinkingTokens ?? undefined,
                sessionScope: 'project' as const,
                yoloMode,
                conversationId: sessionConversationId,
              },
            },
            overleaf: { url: window.location.href },
            context: {
              message: finalMessageText,
              selection: selection?.selection ?? '',
              surroundingBefore: selection?.before ?? '',
              surroundingAfter: selection?.after ?? '',
              ...(messageImages
                ? {
                  images: messageImages.map((image) => ({
                    id: image.id,
                    name: image.name,
                    mediaType: image.mediaType,
                    data: image.data,
                    size: image.size,
                  })),
                }
                : {}),
              ...(messageAttachments
                ? {
                  attachments: messageAttachments.map((attachment) => ({
                    id: attachment.id,
                    path: attachment.path,
                    name: attachment.name,
                    ext: attachment.ext,
                    sizeBytes: attachment.sizeBytes,
                    lineCount: attachment.lineCount,
                    content: attachment.content,
                  })),
                }
                : {}),
            },
            policy: {
              requireApproval: false,
              allowNetwork: false,
              maxFiles: 1,
            },
            userSettings: {
              displayName: options.displayName,
              customSystemPrompt: skillsPrompt
                ? `${options.customSystemPrompt || ''}\n\n${skillsPrompt}`
                : options.customSystemPrompt,
              enableTools: options.enableTools,
              enableCommandBlocklist: options.enableCommandBlocklist,
              blockedCommandsUnix: options.blockedCommandsUnix,
              autoCompactEnabled: options.autoCompactEnabled,
              debugCliEvents: options.debugCliEvents,
            },
          };

      const { jobId } = await createJob(options, payload, {
        signal: abortController.signal,
      });
      const selectionSnapshot: SelectionSnapshot = {
        selection:
          typeof selection?.selection === 'string' ? selection.selection : '',
        from: typeof selection?.from === 'number' ? selection.from : 0,
        to: typeof selection?.to === 'number' ? selection.to : 0,
        lineFrom:
          typeof selection?.lineFrom === 'number'
            ? selection.lineFrom
            : undefined,
        lineTo:
          typeof selection?.lineTo === 'number' ? selection.lineTo : undefined,
        fileName:
          normalizeFilenameLabel(selection?.activeName) ??
          getActiveFilename() ??
          undefined,
      };
      selectionSnapshotsRef.current.set(jobId, selectionSnapshot);
      // A successful job creation proves the host is reachable and the runtime is usable.
      // Keep the indicator stable even if periodic health checks briefly fail.
      const okNow = Date.now();
      lastHostOkAtRef.current = okNow;
      lastRuntimeOkAtRef.current = okNow;
      setConnectionHealth({ hostConnected: true, runtimeWorking: true });

      sessionState.activeJobId = jobId;
      activeJobIdRef.current = jobId;
      setToolRequests([]);
      setToolRequestInputs({});
      setToolRequestBusy(false);
      setStreamingCoT([]);
      streamingCoTRef.current = [];
      sessionState.debugCliEventsEnabled = Boolean(options.debugCliEvents);

      await streamJobEvents(
        options,
        jobId,
        (event: JobEvent) => {
          // Check if job was interrupted
          if (sessionState.interrupted) return;

          if (event.event === 'delta') {
            const deltaText = event.data?.text ?? '';
            const deltaType = (event.data as any)?.type;

            // Handle thinking-type deltas separately (Claude extended thinking)
            if (deltaType === 'thinking' && deltaText) {
              // Accumulate thinking content into streamingThinking state and ref
              streamingThinkingRef.current += deltaText;

              // CoT Logic
              const currentCoT = streamingCoTRef.current;
              // If starting new thinking, ensure last tool is complete
              completeLastTool(currentCoT);

              const lastItem = currentCoT[currentCoT.length - 1];
              if (lastItem && lastItem.type === 'thinking') {
                lastItem.content += deltaText;
              } else {
                currentCoT.push({ type: 'thinking', content: deltaText });
              }

              if (sessionConversationId === chatConversationIdRef.current) {
                setStreamingThinking((prev) => prev + deltaText);
                setStreamingCoT([...currentCoT]);
              }
              return;
            }

            if (deltaText) {
              // For CoT: if normal text arrives, ensure last tool is complete
              const currentCoT = streamingCoTRef.current;
              if (
                completeLastTool(currentCoT) &&
                sessionConversationId === chatConversationIdRef.current
              ) {
                setStreamingCoT([...currentCoT]);
              }

              markThinkingComplete(sessionConversationId);
              // For non-chat actions (rewrite selection / fix error), deltas are typically
              // progress or accidental free-form text. Don't mix them into the chat transcript.
              // Instead, surface lightweight progress in the status line.
              if (action !== 'chat') {
                if (provider === 'codex') {
                  enqueueStreamTokens(
                    sessionConversationId,
                    provider,
                    deltaText
                  );
                  return;
                }
                const trimmed = String(deltaText).trim();
                if (trimmed && /preparing/i.test(trimmed)) {
                  // Only update UI if this is the current session
                  if (sessionConversationId === chatConversationIdRef.current) {
                    setStreamingState(trimmed, true);
                  }
                }
                return;
              }

              // Parse thinking blocks from streaming content (legacy XML-style)
              const { visibleText, newBlocks } = extractThinkingBlocks(
                deltaText,
                sessionState
              );

              // Update message with thinking blocks if any
              if (newBlocks.length > 0) {
                setMessages((prev) => {
                  const messages = [...prev];
                  const lastMsg = messages[messages.length - 1];
                  if (lastMsg?.role === 'assistant') {
                    lastMsg.thinking = [
                      ...(lastMsg.thinking ?? []),
                      ...newBlocks,
                    ];
                  }
                  return messages;
                });
              }

              // Only stream visible text (without thinking blocks)
              if (visibleText) {
                enqueueStreamTokens(
                  sessionConversationId,
                  provider,
                  visibleText
                );
              }
            }
          }

          if (event.event === 'trace') {
            const message = (event.data as any)?.message;
            if (typeof message === 'string' && message.trim()) {
              const trimmed = message.trim();
              sessionState.statusPrefix = trimmed;
              const elapsedSeconds = sessionState.activityStartTime
                ? Math.max(
                  0,
                  Math.floor(
                    (Date.now() - sessionState.activityStartTime) / 1000
                  )
                )
                : null;
              const status = formatStreamingStatusLine(trimmed, elapsedSeconds);
              if (sessionConversationId === chatConversationIdRef.current) {
                if (status) setStreamingState(status, true);
              }

              if (sessionState.debugCliEventsEnabled) {
                setMessages((prev) => [
                  ...prev,
                  createMessage({ role: 'system', content: trimmed }),
                ]);
              }
            }
            return;
          }

          if (event.event === 'plan') {
            const message = (event.data as any)?.message;
            const phase = (event.data as any)?.phase;
            const toolId = (event.data as any)?.toolId;
            const toolName = (event.data as any)?.toolName;

            // Track tool execution states for visibility
            if (phase === 'tool_start' && toolId) {
              const toolInput = (event.data as any)?.input;

              // CoT Logic
              const currentCoT = streamingCoTRef.current;
              completeLastTool(currentCoT); // Complete previous tool if any

              if (
                !currentCoT.some(
                  (i) => i.type === 'tool' && i.toolId === toolId
                )
              ) {
                currentCoT.push({
                  type: 'tool',
                  toolId,
                  toolName: toolName ?? 'Tool',
                  input: toolInput,
                  phase: 'started',
                  message: `Running ${toolName ?? 'tool'}...`,
                });
                if (sessionConversationId === chatConversationIdRef.current) {
                  setStreamingCoT([...currentCoT]);
                }
              }
              setActiveTools((prev) => {
                const next = new Map(prev);
                next.set(toolId, {
                  toolId,
                  toolName: toolName ?? 'Tool',
                  phase: 'started',
                  message: message ?? `Running ${toolName ?? 'tool'}`,
                  input: toolInput,
                  timestamp: Date.now(),
                });
                return next;
              });

              // Auto-timeout after 60s - mark as failed and schedule removal
              setTimeout(() => {
                setActiveTools((curr) => {
                  const tool = curr.get(toolId);
                  if (tool?.phase === 'started') {
                    const next = new Map(curr);
                    next.set(toolId, {
                      ...tool,
                      phase: 'failed',
                      message: 'Timed out',
                    });
                    // Remove after 3 seconds
                    setTimeout(() => {
                      setActiveTools((c) => {
                        const n = new Map(c);
                        n.delete(toolId);
                        return n;
                      });
                    }, 3000);
                    return next;
                  }
                  return curr;
                });
              }, 60000);
            }

            // Always reflect plan/status updates in the live status line while streaming.
            if (typeof message === 'string' && message.trim()) {
              const trimmed = message.trim();
              sessionState.statusPrefix = trimmed;
              const elapsedSeconds = sessionState.activityStartTime
                ? Math.max(
                  0,
                  Math.floor(
                    (Date.now() - sessionState.activityStartTime) / 1000
                  )
                )
                : null;
              const status = formatStreamingStatusLine(trimmed, elapsedSeconds);
              if (sessionConversationId === chatConversationIdRef.current) {
                if (status) setStreamingState(status, true);
              }
            }

            // Display compaction-related plan events in chat
            if (
              typeof message === 'string' &&
              message.toLowerCase().includes('compact')
            ) {
              setMessages((prev) => [
                ...prev,
                createMessage({ role: 'system', content: message }),
              ]);
            }
            return;
          }

          if (event.event === 'tool_call') {
            const kind = event.data?.kind;
            const requestId = event.data?.requestId;
            if (
              (kind === 'approval' || kind === 'user_input') &&
              (typeof requestId === 'number' || typeof requestId === 'string')
            ) {
              setToolRequests((prev) => {
                if (prev.some((existing) => existing.requestId === requestId)) {
                  return prev;
                }
                return [
                  ...prev,
                  {
                    kind,
                    requestId,
                    method: String(event.data?.method ?? ''),
                    params: event.data?.params ?? {},
                  },
                ];
              });
            }
            return;
          }

          if (event.event === 'usage') {
            const usedTokens = Number(event.data?.usedTokens ?? 0);
            const contextWindow =
              Number(event.data?.contextWindow ?? 0) || null;
            const normalized = normalizeContextUsage({
              usedTokens,
              contextWindow,
            });
            setContextUsage(normalized);
            const state = chatStateRef.current;
            if (state) {
              const nextUsage: StoredContextUsage = {
                usedTokens: normalized.usedTokens,
                contextWindow: normalized.contextWindow,
                percentage: normalized.percentage ?? null,
                updatedAt: Date.now(),
              };
              chatStateRef.current = setConversationContextUsage(
                state,
                provider,
                sessionConversationId,
                nextUsage
              );
              scheduleChatSave();
            }
            return;
          }

          if (event.event === 'patch') {
            markThinkingComplete(sessionConversationId);
            sessionState.didReceivePatch = true;
            const patch = event.data as Patch;
            const state = chatStateRef.current;
            if (!state) return;
            const conversation = findConversation(state, sessionConversationId);
            if (!conversation) return;

            if (
              patchFeedbackTargetActive &&
              patchFeedbackTargetActive.conversationId === sessionConversationId
            ) {
              const expectedKind = patchFeedbackTargetActive.kind;
              if (
                patch.kind === 'replaceSelection' ||
                patch.kind === 'replaceRangeInFile'
              ) {
                const idx = patchFeedbackTargetActive.messageIndex;
                const storedTarget = conversation.messages[idx];
                const targetReview = storedTarget?.patchReview;
                if (
                  storedTarget &&
                  targetReview &&
                  targetReview.kind === expectedKind &&
                  'text' in targetReview
                ) {
                  const updatedStoredMessages = [...conversation.messages];
                  updatedStoredMessages[idx] = {
                    ...storedTarget,
                    patchReview: {
                      ...(targetReview as any),
                      text: patch.text,
                      status: 'pending',
                    },
                  };
                  chatStateRef.current = setConversationMessages(
                    state,
                    conversation.provider,
                    sessionConversationId,
                    updatedStoredMessages
                  );
                  scheduleChatSave();

                  // Only update UI if this is the current session (message ids are ephemeral per mount).
                  if (sessionConversationId === chatConversationIdRef.current) {
                    const messageId = patchFeedbackTargetActive.messageId;
                    setMessages((prev) =>
                      prev.map((msg) => {
                        if (msg.id !== messageId) return msg;
                        if (!msg.patchReview) return msg;
                        if (msg.patchReview.kind !== expectedKind) return msg;
                        if (!('text' in msg.patchReview)) return msg;
                        return {
                          ...msg,
                          patchReview: {
                            ...(msg.patchReview as any),
                            text: patch.text,
                            status: 'pending',
                          },
                        };
                      })
                    );
                    setPatchActionErrors((prev) => {
                      const { [messageId]: _removed, ...rest } = prev;
                      return rest;
                    });
                  }

                  if (patch.kind === 'replaceSelection') {
                    selectionSnapshotsRef.current.delete(jobId);
                  }

                  patchFeedbackTargetActive = null;
                  return;
                }
              }

              // Only apply feedback target once; fall through to the normal patch handling otherwise.
              patchFeedbackTargetActive = null;
            }

            let storedPatchReviewMessage: StoredMessage | null = null;
            if (patch.kind === 'replaceSelection') {
              const snapshot = selectionSnapshotsRef.current.get(jobId) ?? null;
              selectionSnapshotsRef.current.delete(jobId);
              if (snapshot) {
                storedPatchReviewMessage = {
                  role: 'system',
                  content: '',
                  patchReview: {
                    kind: 'replaceSelection',
                    selection: snapshot.selection,
                    from: snapshot.from,
                    to: snapshot.to,
                    ...(typeof snapshot.lineFrom === 'number'
                      ? { lineFrom: snapshot.lineFrom }
                      : {}),
                    ...(typeof snapshot.lineTo === 'number'
                      ? { lineTo: snapshot.lineTo }
                      : {}),
                    text: patch.text,
                    status: 'pending',
                    ...(snapshot.fileName
                      ? { fileName: snapshot.fileName }
                      : {}),
                  },
                };
              } else {
                storedPatchReviewMessage = {
                  role: 'system',
                  content:
                    'Rewrite selection proposal (missing selection snapshot; cannot apply automatically).',
                };
              }
            } else if (patch.kind === 'replaceRangeInFile') {
              storedPatchReviewMessage = {
                role: 'system',
                content: '',
                patchReview: {
                  kind: 'replaceRangeInFile',
                  filePath: patch.filePath,
                  expectedOldText: patch.expectedOldText,
                  text: patch.text,
                  ...(typeof patch.from === 'number'
                    ? { from: patch.from }
                    : {}),
                  ...(typeof patch.to === 'number' ? { to: patch.to } : {}),
                  status: 'pending',
                },
              };
            } else if (patch.kind === 'insertAtCursor') {
              const filename = getActiveFilename() ?? 'snippet.tex';
              const language = getFenceLanguage(filename) || 'tex';
              const fence = getSafeMarkdownFence(patch.text);
              const fenceStart = language ? `${fence}${language}` : fence;
              const content = `${fenceStart}\n${patch.text}\n${fence}\n`;
              storedPatchReviewMessage = { role: 'assistant', content };
            }

            if (!storedPatchReviewMessage) return;

            // For chat, queue patch review cards so they render inline (after the assistant response),
            // instead of appearing "pinned" above the message while streaming.
            //
            // NOTE: In rare cases (race / late events), a patch can arrive after we already finalized
            // the assistant message. In that case, queueing would "lose" the review card because there
            // is no pending done event left to flush it. If the job is already finalized, append
            // immediately instead.
            if (action === 'chat') {
              const jobStillActive =
                sessionState.activeJobId === jobId ||
                sessionState.isSending ||
                sessionState.pendingDone != null;
              if (jobStillActive) {
                sessionState.pendingPatchReviewMessages.push(
                  storedPatchReviewMessage
                );
                // If we're already waiting on `done` but tokens are drained, flush immediately.
                maybeFinalizeStream(sessionConversationId, provider);
                return;
              }
            }

            const updatedMessages = [
              ...conversation.messages,
              storedPatchReviewMessage,
            ];
            chatStateRef.current = setConversationMessages(
              state,
              conversation.provider,
              sessionConversationId,
              updatedMessages
            );
            scheduleChatSave();

            // Only update UI if this is the current session
            if (sessionConversationId === chatConversationIdRef.current) {
              setMessages(updatedMessages.map((m) => createMessage(m)));
            }
          }

          if (event.event === 'done') {
            markThinkingComplete(sessionConversationId);
            const rawStatus =
              typeof (event.data as any)?.status === 'string'
                ? String((event.data as any).status).trim()
                : 'ok';
            const normalizedStatus = rawStatus.toLowerCase();
            const status =
              normalizedStatus === 'complete' ||
                normalizedStatus === 'success' ||
                normalizedStatus === 'ok'
                ? 'ok'
                : normalizedStatus;
            const message =
              typeof (event.data as any)?.message === 'string' &&
                String((event.data as any).message).trim()
                ? String((event.data as any).message)
                : status === 'ok'
                  ? undefined
                  : `Job finished with status "${rawStatus}"`;
            sessionState.pendingDone = {
              status,
              message,
            };
            pendingDoneRef.current = sessionState.pendingDone;
            if (provider === 'codex') {
              const threadId = event.data?.threadId;
              if (typeof threadId === 'string' && threadId) {
                const projectId = chatProjectIdRef.current;
                const state = chatStateRef.current;
                if (projectId && state) {
                  chatStateRef.current = setConversationCodexThreadId(
                    state,
                    sessionConversationId,
                    threadId
                  );
                  scheduleChatSave();
                }
              }
            }
            maybeFinalizeStream(sessionConversationId, provider);
          }
        },
        { signal: abortController.signal }
      );
    } catch (error) {
      const isAbortError =
        sessionState.interrupted &&
        error instanceof Error &&
        error.name === 'AbortError';
      if (isAbortError) {
        // Update session state
        sessionState.activityStartTime = null;
        sessionState.pendingDone = null;
        sessionState.streamTokens = [];
        stopStreamTimer(sessionConversationId);
        stopThinkingTimer(sessionConversationId);
        sessionState.streamingText = '';

        // Update UI if current session
        if (sessionConversationId === chatConversationIdRef.current) {
          setStreamingState(null, false);
          activityStartRef.current = null;
          pendingDoneRef.current = null;
          streamTokensRef.current = [];
          setStreamingText('');
          setStreamingThinking('');
          streamingTextRef.current = '';
          streamingThinkingRef.current = '';
        }
        finishSessionJob(sessionConversationId);
        return;
      }

      // Handle non-abort errors
      const message = error instanceof Error ? error.message : 'Request failed';

      // Update session state
      sessionState.activityStartTime = null;
      sessionState.pendingDone = null;
      sessionState.streamTokens = [];
      stopStreamTimer(sessionConversationId);
      stopThinkingTimer(sessionConversationId);
      sessionState.streamingText = '';

      // Update UI if current session
      if (sessionConversationId === chatConversationIdRef.current) {
        setMessages((prev) => [
          ...prev,
          createMessage({ role: 'system', content: message }),
        ]);
        setStreamingState(null, false);
        activityStartRef.current = null;
        pendingDoneRef.current = null;
        streamTokensRef.current = [];
        setStreamingText('');
        setStreamingThinking('');
        streamingTextRef.current = '';
        streamingThinkingRef.current = '';
      }
      finishSessionJob(sessionConversationId);
    } finally {
      if (sessionState.abortController === abortController) {
        sessionState.abortController = null;
      }
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  const onSend = () => {
    const bridge = window.ageafBridge;
    const { text, hasContent } = serializeEditorContent();
    const imageList = imageAttachmentsRef.current;
    const fileList = fileAttachmentsRef.current;
    const hasImages = imageList.length > 0;
    const hasFiles = fileList.length > 0;
    if (!bridge || (!hasContent && !hasImages && !hasFiles)) return;

    // Allow users to approve a pending tool request by pasting a request id.
    // Example: "Get on with Request ID: f9e2dd31-000b-469f-be7a-939230e455c7"
    if (!hasImages && !hasFiles) {
      const match = text.trim().match(/^Get on with Request ID:\s*(.+)\s*$/i);
      if (match) {
        const requestId = match[1]?.trim();
        if (requestId) {
          const pending = toolRequests.find(
            (req) =>
              String(req.requestId) === requestId && req.kind === 'approval'
          );
          clearEditor();
          pendingPatchFeedbackTargetRef.current = null;
          scrollToBottom();
          if (pending) {
            void respondToToolRequest(pending, 'accept');
          } else {
            setMessages((prev) => [
              ...prev,
              createMessage({
                role: 'system',
                content: `No pending approval found for request id: ${requestId}`,
              }),
            ]);
          }
          return;
        }
      }
    }

    const conversationId = chatConversationIdRef.current;
    if (!conversationId) return;

    const sessionState = getSessionState(conversationId);
    const rawPatchFeedbackTarget = pendingPatchFeedbackTargetRef.current;
    const patchFeedbackTarget =
      rawPatchFeedbackTarget &&
        rawPatchFeedbackTarget.conversationId === conversationId
        ? rawPatchFeedbackTarget
        : undefined;
    pendingPatchFeedbackTargetRef.current = null;

    const messageImages = hasImages ? [...imageList] : [];
    const messageFiles = hasFiles ? [...fileList] : [];
    clearEditor();
    scrollToBottom();
    if (sessionState.isSending) {
      enqueueMessage(
        conversationId,
        text,
        messageImages,
        messageFiles,
        patchFeedbackTarget
      );
      return;
    }
    void sendMessage(
      text,
      messageImages,
      messageFiles,
      'chat',
      patchFeedbackTarget
    );
  };

  const onRewriteSelection = async () => {
    const bridge = window.ageafBridge;
    if (!bridge) return;

    const conversationId = chatConversationIdRef.current;
    if (!conversationId) return;

    if (!editorEmpty) {
      setMessages((prev) => [
        ...prev,
        createMessage({
          role: 'system',
          content: 'Clear the message input before rewriting a selection.',
        }),
      ]);
      return;
    }

    const sessionState = getSessionState(conversationId);
    if (sessionState.isSending) {
      setMessages((prev) => [
        ...prev,
        createMessage({
          role: 'system',
          content: 'Please wait for the current response to finish.',
        }),
      ]);
      return;
    }

    let selection: Awaited<
      ReturnType<NonNullable<typeof bridge.requestSelection>>
    > | null = null;
    try {
      selection = await bridge.requestSelection();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        createMessage({
          role: 'system',
          content:
            error instanceof Error
              ? error.message
              : 'Unable to read the current selection.',
        }),
      ]);
      return;
    }

    const selectedText =
      typeof selection?.selection === 'string'
        ? selection.selection.trim()
        : '';
    if (!selectedText) {
      setMessages((prev) => [
        ...prev,
        createMessage({
          role: 'system',
          content:
            'Select some LaTeX in Overleaf before using Rewrite selection.',
        }),
      ]);
      return;
    }

    void sendMessage('Rewrite selection', [], [], 'rewrite');
  };

  const onInputKeyDown = (event: KeyboardEvent) => {
    if (mentionOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionIndex((prev) =>
          Math.min(prev + 1, Math.max(0, mentionResults.length - 1))
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const selected = mentionResults[mentionIndex];
        if (selected) {
          event.preventDefault();
          insertMentionEntry(selected);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    if (skillOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSkillIndex((prev) =>
          Math.min(prev + 1, Math.max(0, skillResults.length - 1))
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSkillIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const selected = skillResults[skillIndex];
        if (selected) {
          event.preventDefault();
          insertSkill(selected);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSkillOpen(false);
        return;
      }
    }

    // Local undo/redo for the editor to avoid Overleaf intercepting Cmd/Ctrl+Z/Y.
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      const editor = editorRef.current;

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (editor) {
          editor.focus();
          document.execCommand('undo');
        }
        return;
      }

      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        if (editor) {
          editor.focus();
          document.execCommand('redo');
        }
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      void insertChipFromSelection();
      return;
    }

    if (event.key === 'Backspace') {
      if (removeAdjacentChip('backward')) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === 'Delete') {
      if (removeAdjacentChip('forward')) {
        event.preventDefault();
        return;
      }
    }

    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.isComposing || isComposingRef.current) return;

    const compositionKeyCode = 229;
    if (event.keyCode === compositionKeyCode) return;

    event.preventDefault();
    void onSend();
  };

  const clearPatchActionState = () => {
    setPatchActionBusyId(null);
    setPatchActionErrors({});
  };

  const updatePatchReviewMessage = (
    messageId: string,
    updater: (patchReview: StoredPatchReview) => StoredPatchReview
  ) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        if (!msg.patchReview) return msg;
        return { ...msg, patchReview: updater(msg.patchReview) };
      })
    );
  };

  const setPatchReviewStatus = (
    messageId: string,
    status: 'pending' | 'accepted' | 'rejected'
  ) => {
    updatePatchReviewMessage(
      messageId,
      (patchReview) => ({ ...patchReview, status } as any)
    );
  };

  const onRejectPatchReviewMessage = (messageId: string) => {
    setPatchReviewStatus(messageId, 'rejected');
    setPatchActionErrors((prev) => {
      const { [messageId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const onFeedbackPatchReviewMessage = (
    messageId: string,
    overrideText?: string
  ) => {
    const conversationId = chatConversationIdRef.current;
    if (!conversationId) return;
    const msg = messages.find((m) => m.id === messageId);
    const patchReview = msg?.patchReview;
    if (!patchReview) return;
    const status = (patchReview as any).status ?? 'pending';
    if (status !== 'pending') return;

    if (
      patchReview.kind !== 'replaceSelection' &&
      patchReview.kind !== 'replaceRangeInFile'
    ) {
      return;
    }

    const messageIndex = messages.indexOf(msg);
    if (messageIndex < 0) return;

    const fileHint =
      patchReview.kind === 'replaceRangeInFile'
        ? patchReview.filePath
        : patchReview.fileName ?? getActiveFilename() ?? 'snippet.tex';

    const oldText =
      patchReview.kind === 'replaceSelection'
        ? patchReview.selection
        : patchReview.expectedOldText;
    const newText =
      typeof overrideText === 'string' ? overrideText : patchReview.text;

    if (typeof overrideText === 'string' && overrideText !== patchReview.text) {
      updatePatchReviewMessage(messageId, (existing) => {
        if (
          (existing.kind === 'replaceSelection' ||
            existing.kind === 'replaceRangeInFile') &&
          'text' in existing
        ) {
          return { ...(existing as any), text: overrideText };
        }
        return existing;
      });
    }

    if (!editorEmpty) {
      insertTextAtCursor('\n\n');
    }

    const lineFrom =
      patchReview.kind === 'replaceSelection'
        ? patchReview.lineFrom
        : undefined;
    const lineTo =
      patchReview.kind === 'replaceSelection' ? patchReview.lineTo : undefined;

    const promptLine1 =
      'Please refine the proposed change below based on my feedback.';
    const promptLine2 = `Respond with exactly one ageaf-patch code block with kind ${patchReview.kind} and ONLY the updated proposal.`;
    const targetLine = `Target: ${fileHint}`;
    const combined = `${promptLine1}\n${promptLine2}\n${targetLine}\n\nCurrent text:\n\n${oldText}\n\nProposed text:\n\n${newText}\n\nFeedback:\n`;
    insertChipFromText(combined, fileHint, lineFrom, lineTo);

    editorRef.current?.focus();
    scrollToBottom();

    pendingPatchFeedbackTargetRef.current = {
      conversationId,
      messageId,
      messageIndex,
      kind: patchReview.kind,
    };
  };

  const onAcceptPatchReviewMessage = async (
    messageId: string,
    overrideText?: string
  ) => {
    if (patchActionBusyId) return;
    const msg = messages.find((m) => m.id === messageId);
    const patchReview = msg?.patchReview;
    if (!patchReview) return;
    const status = (patchReview as any).status ?? 'pending';
    if (status !== 'pending') return;

    setPatchActionBusyId(messageId);
    setPatchActionErrors((prev) => {
      const { [messageId]: _removed, ...rest } = prev;
      return rest;
    });

    try {
      if (patchReview.kind === 'replaceSelection') {
        if (!window.ageafBridge?.applyReplaceRange) {
          setPatchActionErrors((prev) => ({
            ...prev,
            [messageId]: 'Apply bridge unavailable',
          }));
          return;
        }
        const nextText =
          typeof overrideText === 'string' ? overrideText : patchReview.text;
        const result = await window.ageafBridge.applyReplaceRange({
          from: patchReview.from,
          to: patchReview.to,
          expectedOldText: patchReview.selection,
          text: nextText,
        });
        if (!result?.ok) {
          setPatchActionErrors((prev) => ({
            ...prev,
            [messageId]: result?.error ?? 'Selection changed',
          }));
          return;
        }
        setPatchReviewStatus(messageId, 'accepted');
        return;
      }

      if (patchReview.kind === 'replaceRangeInFile') {
        if (!window.ageafBridge?.applyReplaceInFile) {
          setPatchActionErrors((prev) => ({
            ...prev,
            [messageId]: 'Apply bridge unavailable',
          }));
          return;
        }
        const nextText =
          typeof overrideText === 'string' ? overrideText : patchReview.text;
        const result = await window.ageafBridge.applyReplaceInFile({
          filePath: patchReview.filePath,
          expectedOldText: patchReview.expectedOldText,
          text: nextText,
          ...(typeof patchReview.from === 'number'
            ? { from: patchReview.from }
            : {}),
          ...(typeof patchReview.to === 'number' ? { to: patchReview.to } : {}),
        });
        if (!result?.ok) {
          setPatchActionErrors((prev) => ({
            ...prev,
            [messageId]: result?.error ?? 'Unable to apply patch',
          }));
          return;
        }
        setPatchReviewStatus(messageId, 'accepted');
        return;
      }

      if (patchReview.kind === 'insertAtCursor') {
        if (!window.ageafBridge) return;
        const nextText =
          typeof overrideText === 'string' ? overrideText : patchReview.text;
        window.ageafBridge.insertAtCursor(nextText);
        setPatchReviewStatus(messageId, 'accepted');
        return;
      }

      setPatchActionErrors((prev) => ({
        ...prev,
        [messageId]: 'Unsupported patch kind',
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to apply patch';
      setPatchActionErrors((prev) => ({ ...prev, [messageId]: message }));
    } finally {
      setPatchActionBusyId(null);
    }
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          messageId?: string;
          action?: string;
          text?: string;
        }>
      ).detail;
      if (!detail?.messageId || !detail?.action) return;
      if (detail.action === 'accept') {
        void onAcceptPatchReviewMessage(detail.messageId, detail.text);
        return;
      }
      if (detail.action === 'feedback') {
        onFeedbackPatchReviewMessage(detail.messageId, detail.text);
        return;
      }
      if (detail.action === 'reject') {
        onRejectPatchReviewMessage(detail.messageId);
      }
    };
    window.addEventListener(
      PANEL_OVERLAY_ACTION_EVENT,
      handler as EventListener
    );
    return () =>
      window.removeEventListener(
        PANEL_OVERLAY_ACTION_EVENT,
        handler as EventListener
      );
  }, [
    onAcceptPatchReviewMessage,
    onFeedbackPatchReviewMessage,
    onRejectPatchReviewMessage,
  ]);

  const emitPendingOverlay = (force = false) => {
    const pendingMessages = [...messages].filter(
      (msg) =>
        msg.patchReview &&
        ((msg.patchReview as any).status ?? 'pending') === 'pending'
    );
    if (pendingMessages.length === 0) {
      // During initial mount, messages are temporarily empty until chat hydration finishes.
      // Do NOT clear the stored overlay in that window, or refresh restore will never show.
      if (!chatHydratedRef.current) return;
      if (overlayActiveDetailsRef.current.size > 0) {
        window.dispatchEvent(new CustomEvent(EDITOR_OVERLAY_CLEAR_EVENT));
        overlayActiveDetailsRef.current.clear();
      }
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.remove([LOCAL_STORAGE_KEY_INLINE_OVERLAY]);
        }
        window.localStorage.removeItem(LOCAL_STORAGE_KEY_INLINE_OVERLAY);
      } catch {
        // ignore storage errors
      }
      return;
    }

    const pendingDetails = pendingMessages
      .map((msg) => {
        const patchReview = msg.patchReview!;
        const status = (patchReview as any).status ?? 'pending';
        if (status !== 'pending') return null;
        return {
          messageId: msg.id,
          kind: patchReview.kind,
          from:
            patchReview.kind === 'replaceSelection'
              ? patchReview.from
              : patchReview.kind === 'replaceRangeInFile'
                ? patchReview.from
                : undefined,
          to:
            patchReview.kind === 'replaceSelection'
              ? patchReview.to
              : patchReview.kind === 'replaceRangeInFile'
                ? patchReview.to
                : undefined,
          oldText:
            patchReview.kind === 'replaceSelection'
              ? patchReview.selection
              : patchReview.kind === 'replaceRangeInFile'
                ? patchReview.expectedOldText
                : '',
          newText: 'text' in patchReview ? patchReview.text : '',
          filePath:
            patchReview.kind === 'replaceRangeInFile'
              ? patchReview.filePath
              : undefined,
          fileName:
            patchReview.kind === 'replaceSelection'
              ? patchReview.fileName ?? undefined
              : undefined,
          projectId: getOverleafProjectIdFromPathname(window.location.pathname),
        };
      })
      .filter(Boolean) as any[];

    const nextDetails = new Map<string, string>();
    for (const detail of pendingDetails) {
      const id = String(detail.messageId);
      const signature = JSON.stringify({
        kind: detail.kind,
        from: detail.from ?? null,
        to: detail.to ?? null,
        oldText: detail.oldText ?? '',
        newText: detail.newText ?? '',
        filePath: detail.filePath ?? '',
        fileName: detail.fileName ?? '',
      });
      nextDetails.set(id, signature);
    }
    const nextIds = new Set(nextDetails.keys());
    const prevDetails = overlayActiveDetailsRef.current;

    // Clear overlays that are no longer pending
    for (const prevId of prevDetails.keys()) {
      if (!nextIds.has(prevId)) {
        window.dispatchEvent(
          new CustomEvent(EDITOR_OVERLAY_CLEAR_EVENT, {
            detail: { messageId: prevId },
          })
        );
      }
    }

    // Emit shows for all pending overlays (new, changed, or forced)
    for (const detail of pendingDetails) {
      const id = String(detail.messageId);
      const prevSignature = prevDetails.get(id);
      const nextSignature = nextDetails.get(id);
      if (!force && prevSignature === nextSignature) continue;
      window.dispatchEvent(
        new CustomEvent(EDITOR_OVERLAY_SHOW_EVENT, { detail })
      );
    }

    overlayActiveDetailsRef.current = nextDetails;

    // Persist the full pending set for refresh restore.
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({
          [LOCAL_STORAGE_KEY_INLINE_OVERLAY]: pendingDetails,
        });
      }
      window.localStorage.setItem(
        LOCAL_STORAGE_KEY_INLINE_OVERLAY,
        JSON.stringify(pendingDetails)
      );
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    emitPendingOverlay(false);
  }, [messages]);

  useEffect(() => {
    const handler = () => {
      overlayActiveDetailsRef.current.clear();
      emitPendingOverlay(true);
    };
    window.addEventListener(
      EDITOR_OVERLAY_READY_EVENT,
      handler as EventListener
    );
    return () =>
      window.removeEventListener(
        EDITOR_OVERLAY_READY_EVENT,
        handler as EventListener
      );
  }, [messages]);

  useEffect(() => {
    // After refresh, the editor overlay may have already fired its "ready" event
    // before the panel mounted. If so, `__ageafOverlayReady` will be set.
    // We retry for a short time to cover both load orders.
    const hasPending = messages.some(
      (msg) =>
        msg.patchReview &&
        ((msg.patchReview as any).status ?? 'pending') === 'pending'
    );
    if (!hasPending) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const ready = Boolean((window as any).__ageafOverlayReady);
      if (ready) {
        overlayActiveDetailsRef.current.clear();
        emitPendingOverlay(true);
        window.clearInterval(timer);
        return;
      }
      if (attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 250);

    // Try immediately too (covers fast loads).
    if (Boolean((window as any).__ageafOverlayReady)) {
      overlayActiveDetailsRef.current.clear();
      emitPendingOverlay(true);
      window.clearInterval(timer);
    }

    return () => window.clearInterval(timer);
  }, [messages]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent(EDITOR_OVERLAY_CLEAR_EVENT));
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.remove([LOCAL_STORAGE_KEY_INLINE_OVERLAY]);
        }
      } catch {
        // ignore storage errors
      }
    };
  }, []);

  const dismissToolRequest = () => {
    setToolRequests((prev) => prev.slice(1));
    setToolRequestInputs({});
    setToolRequestBusy(false);
  };

  const respondToToolRequest = async (
    request: ToolRequest,
    result: unknown
  ) => {
    if (toolRequestBusy) return;
    const jobId = activeJobIdRef.current;
    if (!jobId) {
      dismissToolRequest();
      return;
    }

    setToolRequestBusy(true);
    try {
      const options = await getOptions();
      await respondToJobRequest(options, jobId, {
        requestId: request.requestId,
        result,
      });
      dismissToolRequest();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to respond to tool request';
      setMessages((prev) => [
        ...prev,
        createMessage({ role: 'system', content: message }),
      ]);
      setToolRequestBusy(false);
    }
  };

  const onSaveSettings = async () => {
    if (!settings) return;

    // Warn if user has API key in env vars
    const hasClaudeKey = detectApiKeyInEnvVars(settings.claudeEnvVars);
    const hasOpenaiKey = detectApiKeyInEnvVars(settings.openaiEnvVars);

    if (hasClaudeKey || hasOpenaiKey) {
      const confirmed = confirm(
        '⚠️ Warning: You appear to have an API key in the environment ' +
          'variables field. This will be saved to browser storage.\n\n' +
          'For better security, use the "API Key" field instead, which ' +
          'keeps keys in memory only.\n\n' +
          'Continue saving?'
      );

      if (!confirmed) {
        setSettingsMessage('Save canceled');
        return;
      }
    }

    try {
      await chrome.storage.local.set({ [LOCAL_STORAGE_KEY_OPTIONS]: settings });
      // API keys entered in dedicated fields are NOT saved
      const message =
        claudeApiKey || openaiApiKey
          ? 'Saved (API keys kept in memory only)'
          : 'Saved';
      setSettingsMessage(message);
      void refreshContextUsage({ force: true });
    } catch (error) {
      // Extension context invalidated - show error message
      if (
        error instanceof Error &&
        error.message.includes('Extension context invalidated')
      ) {
        setSettingsMessage('Extension reloaded. Please refresh the page.');
        return;
      }
      throw error;
    }
  };

  const updateSettings = (next: Partial<Options>) => {
    if (!settings) return;
    setSettingsMessage('');
    setSettings({ ...settings, ...next });
  };

  const refreshHostToolsStatus = async (options: Options) => {
    try {
      const status = await fetchHostToolsStatus(options);
      setHostToolsStatus(status);
    } catch {
      setHostToolsStatus(null);
    }
  };

  useEffect(() => {
    if (!settingsOpen || !settings) return;
    void refreshHostToolsStatus(settings);
  }, [settingsOpen]);

  const selectedThinkingMode = getSelectedThinkingMode();
  const contextWindow = contextUsage?.contextWindow ?? null;
  const usedTokens = contextUsage?.usedTokens ?? 0;
  const usagePercent =
    typeof contextUsage?.percentage === 'number'
      ? Math.min(100, Math.max(0, contextUsage.percentage))
      : contextWindow && contextWindow > 0
        ? Math.min(100, Math.round((usedTokens / contextWindow) * 100))
        : 0;
  const usageLabel = contextWindow
    ? `${formatTokenCount(usedTokens)} / ${formatTokenCount(contextWindow)}`
    : usedTokens > 0
      ? `${formatTokenCount(usedTokens)} used`
      : 'Context usage unavailable';
  const ringCircumference = 2 * Math.PI * 10;
  const panelToggleLabel = collapsed ? 'Show panel' : 'Hide panel';
  const panelToggleTooltip = collapsed
    ? 'Click to show the panel'
    : 'Click to hide the panel';

  useEffect(() => {
    const circle = contextRingRef.current;
    if (!circle) return;
    const pct = Math.min(100, Math.max(0, usagePercent));
    const progress = (ringCircumference * pct) / 100;
    const offset = ringCircumference - progress;
    circle.setAttribute('stroke-dasharray', String(ringCircumference));
    circle.setAttribute('stroke-dashoffset', String(offset));
  }, [usagePercent, ringCircumference]);

  const onTogglePanel = () => {
    setCollapsed((prev) => !prev);
  };

  const onClearChat = () => {
    setMessages([]);
    clearEditor();
    scrollToBottom();
    const projectId = chatProjectIdRef.current;
    const conversationId = chatConversationIdRef.current;
    const state = chatStateRef.current;
    if (!projectId || !conversationId || !state) return;
    chatStateRef.current = setConversationMessages(
      state,
      chatProvider,
      conversationId,
      []
    );
    scheduleChatSave();
  };

  const onNewChat = async (provider: ProviderId) => {
    const projectId = chatProjectIdRef.current;
    const state = chatStateRef.current;
    if (!projectId || !state) return;
    const {
      state: nextState,
      conversation,
      evicted,
    } = startNewConversation(state, provider);

    // Clean up evicted session directories and runtime state
    if (evicted.length > 0) {
      const options = await getOptions();
      for (const evictedId of evicted) {
        // Clean up runtime state (abort jobs, clear timers)
        cleanupSessionState(evictedId);

        try {
          // For Codex, need to look up the conversation to get threadId
          const evictedConversation = findConversation(state, evictedId);
          const sessionIdToDelete =
            provider === 'codex' &&
              evictedConversation?.providerState?.codex?.threadId
              ? evictedConversation.providerState.codex.threadId
              : evictedId;
          await deleteSession(options, provider, sessionIdToDelete);
        } catch (error) {
          console.error(
            `Failed to delete evicted ${provider} session ${evictedId}:`,
            error
          );
        }
      }
    }

    chatStateRef.current = nextState;
    chatConversationIdRef.current = conversation.id;
    setSessionIds(getOrderedSessionIds(nextState));
    setActiveSessionId(conversation.id);
    setChatProvider(provider);
    setMessages([]);
    setToolRequests([]);
    setToolRequestInputs({});
    setToolRequestBusy(false);
    clearEditor();
    scrollToBottom();
    setContextUsageFromStored(getCachedStoredUsage(conversation, provider));
    void refreshContextUsage({ provider, conversationId: conversation.id });
    scheduleChatSave();
  };

  const onSelectSession = (conversationId: string) => {
    // Session switching is always allowed - no blocking
    const projectId = chatProjectIdRef.current;
    const state = chatStateRef.current;
    if (!projectId || !state) return;
    const conversation = findConversation(state, conversationId);
    if (!conversation) return;

    const provider = conversation.provider;
    chatConversationIdRef.current = conversationId;
    chatStateRef.current = setActiveConversation(
      state,
      provider,
      conversationId
    );
    setActiveSessionId(conversationId);
    setChatProvider(provider);

    // Sync UI state from new session's session state
    const sessionState = getSessionState(conversationId);

    // Update sending and queue state
    isSendingRef.current = sessionState.isSending;
    setIsSending(sessionState.isSending);
    setQueueCount(sessionState.queue.length);
    queueRef.current = sessionState.queue.map((q) => ({
      text: q.text,
      images: q.images,
      attachments: q.attachments,
      patchFeedbackTarget: q.patchFeedbackTarget,
    }));

    // Update streaming state
    streamingTextRef.current = sessionState.streamingText;
    setStreamingText(sessionState.streamingText);
    streamTokensRef.current = [...sessionState.streamTokens];
    pendingDoneRef.current = sessionState.pendingDone;
    activityStartRef.current = sessionState.activityStartTime;
    interruptedRef.current = sessionState.interrupted;
    thinkingCompleteRef.current = sessionState.thinkingComplete;
    abortControllerRef.current = sessionState.abortController;
    activeJobIdRef.current = sessionState.activeJobId;

    // Update streaming status display
    if (sessionState.isSending || sessionState.streamTimerId) {
      const status =
        sessionState.thinkingTimerId && !sessionState.thinkingComplete
          ? 'Thinking · ESC to interrupt'
          : sessionState.streamTimerId
            ? 'Streaming · ESC to interrupt'
            : 'Working · ESC to interrupt';
      setStreamingState(status, true);
    } else {
      setStreamingState(null, false);
    }

    // Reset tool UI state (these are not per-session)
    clearPatchActionState();
    setToolRequests([]);
    setToolRequestInputs({});
    setToolRequestBusy(false);

    setMessages(conversation.messages.map((message) => createMessage(message)));
    scrollToBottom();
    setContextUsageFromStored(getCachedStoredUsage(conversation, provider));
    void refreshContextUsage({ provider, conversationId });
    scheduleChatSave();
  };

  const onCloseSession = async () => {
    // Session closing is always allowed - no blocking
    const projectId = chatProjectIdRef.current;
    const state = chatStateRef.current;
    const currentId = chatConversationIdRef.current;
    if (!projectId || !state || !currentId) return;

    const currentConversation = findConversation(state, currentId);
    if (!currentConversation) return;
    const currentProvider = currentConversation.provider;

    // Cleanup session state (abort jobs, clear timers)
    cleanupSessionState(currentId);

    // Delete session directory and runtime state on the host
    // For Codex, use threadId (matches session directory name)
    // For Claude, use conversationId
    try {
      const options = await getOptions();
      const sessionIdToDelete =
        currentProvider === 'codex' &&
          currentConversation.providerState?.codex?.threadId
          ? currentConversation.providerState.codex.threadId
          : currentId;
      await deleteSession(options, currentProvider, sessionIdToDelete);
    } catch (error) {
      console.error(
        `Failed to delete ${currentProvider} session ${currentId}:`,
        error
      );
      // Continue with UI cleanup even if backend deletion fails
    }

    const orderedBefore = getOrderedSessionIds(state);
    const currentIndex = Math.max(0, orderedBefore.indexOf(currentId));
    let nextState = deleteConversation(state, currentProvider, currentId);
    let orderedAfter = getOrderedSessionIds(nextState);
    let nextProvider: ProviderId = currentProvider;

    let nextActiveId: string | null = null;
    if (orderedAfter.length > 0) {
      nextActiveId =
        orderedAfter[Math.min(currentIndex, orderedAfter.length - 1)];
      const nextConversation = nextActiveId
        ? findConversation(nextState, nextActiveId)
        : null;
      if (nextConversation) {
        nextProvider = nextConversation.provider;
        nextState = setActiveConversation(
          nextState,
          nextProvider,
          nextActiveId
        );
      }
    } else {
      nextActiveId = null;
      orderedAfter = [];
    }

    chatStateRef.current = nextState;
    chatConversationIdRef.current = nextActiveId;
    setSessionIds(orderedAfter);
    setActiveSessionId(nextActiveId);
    setChatProvider(nextProvider);

    const nextConversation = nextActiveId
      ? findConversation(nextState, nextActiveId)
      : null;
    setContextUsageFromStored(
      getCachedStoredUsage(nextConversation, nextProvider)
    );
    if (nextActiveId) {
      void refreshContextUsage({
        provider: nextProvider,
        conversationId: nextActiveId,
      });
    }

    clearPatchActionState();
    setToolRequests([]);
    setToolRequestInputs({});
    setToolRequestBusy(false);
    setStreamingState(null, false);
    setStreamingText('');
    setStreamingThinking('');
    streamingTextRef.current = '';
    streamingThinkingRef.current = '';
    streamTokensRef.current = [];
    pendingDoneRef.current = null;

    setMessages(
      nextConversation
        ? nextConversation.messages.map((message) => createMessage(message))
        : []
    );
    clearEditor();
    scrollToBottom();
    scheduleChatSave();
  };

  // Session switching is always allowed - no blocking during streaming
  const activeToolRequest = toolRequests[0] ?? null;
  const activeToolQuestions: ToolInputQuestion[] =
    activeToolRequest?.kind === 'user_input' &&
      Array.isArray(activeToolRequest.params?.questions)
      ? (activeToolRequest.params.questions as unknown[])
        .map((entry): ToolInputQuestion | null => {
          if (!entry || typeof entry !== 'object') return null;
          const id = String((entry as any).id ?? '').trim();
          if (!id) return null;
          const header = String((entry as any).header ?? '');
          const question = String((entry as any).question ?? '');
          const optionsRaw: unknown[] = Array.isArray((entry as any).options)
            ? ((entry as any).options as unknown[])
            : [];
          const options = optionsRaw
            .map((option): ToolInputOption | null => {
              if (!option || typeof option !== 'object') return null;
              const label = String((option as any).label ?? '').trim();
              const description = String(
                (option as any).description ?? ''
              ).trim();
              if (!label && !description) return null;
              return { label, description };
            })
            .filter((option): option is ToolInputOption => Boolean(option));
          return {
            id,
            header,
            question,
            options: options.length ? options : null,
          };
        })
        .filter((entry): entry is ToolInputQuestion => Boolean(entry))
      : [];

  const hasSessions = sessionIds.length > 0;
  const landingPage = (
    <div class="ageaf-landing">
      <div class="ageaf-landing__content">
        <div class="ageaf-landing__header">
          <img
            src={getIconUrl('icons/icon_256.png')}
            class="ageaf-landing__logo"
            alt="Ageaf Logo"
          />
          <div class="ageaf-landing__title">AGEAF</div>
          <div class="ageaf-landing__slogan">YOUR OVERLEAF AGENT</div>
        </div>
        <div class="ageaf-landing__actions">
          <button
            class="ageaf-landing__card"
            type="button"
            onClick={() => void onNewChat('claude')}
            aria-label="Start an Anthropic Claude session"
          >
            <div class="ageaf-landing__card-title">Anthropic</div>
            <div class="ageaf-landing__card-desc">Claude</div>
          </button>
          <button
            class="ageaf-landing__card"
            type="button"
            onClick={() => void onNewChat('codex')}
            aria-label="Start an OpenAI Codex session"
          >
            <div class="ageaf-landing__card-title">OpenAI</div>
            <div class="ageaf-landing__card-desc">Codex</div>
          </button>
        </div>
      </div>
      <div class="ageaf-landing__footer">
        <a
          class="ageaf-landing__help"
          href={HOW_TO_GUIDES_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          How-to Guides
        </a>
      </div>
    </div>
  );

  return (
    <aside
      class={`ageaf-panel ${collapsed ? 'ageaf-panel--collapsed' : ''}`}
      style={{ '--ageaf-panel-width': `${width}px` }}
    >
      <div
        class={`ageaf-panel__divider ${collapsed ? 'is-collapsed' : ''}`}
        onMouseDown={onResizeStart}
      >
        <button
          class={`ageaf-panel__divider-toggle ${collapsed ? 'is-collapsed' : ''
            }`}
          type="button"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={onTogglePanel}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onTogglePanel();
          }}
          aria-label={panelToggleLabel}
          aria-expanded={!collapsed}
          aria-controls="ageaf-panel-inner"
        >
          <span class="ageaf-panel__divider-tooltip" aria-hidden="true">
            {panelToggleTooltip}
          </span>
        </button>
      </div>
      <div class="ageaf-panel__inner" id="ageaf-panel-inner">
        {hasSessions ? (
          <header class="ageaf-panel__header">
            <img
              src={getIconUrl('icons/icon_48.png')}
              class="ageaf-panel__logo"
              alt="Ageaf Logo"
            />
            <div class="ageaf-panel__title">
              <div class="ageaf-panel__name">Ageaf</div>
              <div class="ageaf-panel__intro">
                Your Overleaf Agent
              </div>
            </div>
            <div class="ageaf-panel__header-actions">
              <div
                class={`ageaf-provider ${providerIndicatorClass} ${!connectionHealth.hostConnected ||
                  !connectionHealth.runtimeWorking
                  ? 'ageaf-provider--disconnected'
                  : ''
                  } ${!connectionHealth.hostConnected
                    ? 'ageaf-provider--host-disconnected'
                    : !connectionHealth.runtimeWorking
                      ? 'ageaf-provider--runtime-disconnected'
                      : ''
                  }`}
                aria-label={`Provider: ${providerDisplay.label}`}
                data-tooltip={getConnectionHealthTooltip()}
              >
                <span class="ageaf-provider__dot" aria-hidden="true" />
                <span class="ageaf-provider__label">{providerDisplay.label}</span>
              </div>
              <a
                class="ageaf-panel__help"
                href={HOW_TO_GUIDES_URL}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="How-to Guides"
              >
                ?
              </a>
            </div>
          </header>
        ) : null}
        <div class="ageaf-panel__body">
          {hasSessions ? (
            <>
              <div class="ageaf-panel__chat" ref={chatRef}>
                {messages.map((message) => {
                  const content = renderMessageContent(message);
                  if (!content) return null;
                  const copyResponseText =
                    message.role === 'assistant'
                      ? stripInterruptedByUserSuffix(message.content)
                      : '';
                  const canCopyResponse =
                    message.role === 'assistant' &&
                    copyResponseText.trim().length > 0;
                  const cotForMessage =
                    message.role === 'assistant' && settings?.showThinkingAndTools
                      ? message.cot || convertThinkingToCoT(message.thinking)
                      : null;
                  const hasCoTForMessage = Boolean(
                    cotForMessage && cotForMessage.length > 0
                  );
                  const isStatusCoTToggle = Boolean(
                    message.role === 'assistant' &&
                    message.statusLine &&
                    hasCoTForMessage &&
                    message.id
                  );
                  const isStatusCoTExpanded = isStatusCoTToggle
                    ? expandedThinkingMessages.has(message.id)
                    : false;
                  return (
                    <div
                      class={`ageaf-message ageaf-message--${message.role}`}
                      key={message.id}
                    >
                      {message.role === 'assistant' && message.statusLine ? (
                        isStatusCoTToggle ? (
                          <button
                            class="ageaf-message__status ageaf-message__status--toggle"
                            type="button"
                            aria-expanded={isStatusCoTExpanded}
                            onClick={() => toggleThinkingExpanded(message.id)}
                          >
                            <span class="ageaf-message__status-toggle-arrow">
                              {isStatusCoTExpanded ? '▼' : '▶'}
                            </span>
                            <span class="ageaf-message__status-toggle-text">
                              {message.statusLine}
                            </span>
                          </button>
                        ) : (
                          <div class="ageaf-message__status">
                            {message.statusLine}
                          </div>
                        )
                      ) : null}
                      {hasCoTForMessage
                        ? renderCoTBlock(
                          cotForMessage!,
                          false,
                          message.role === 'assistant' ? message.id : undefined,
                          {
                            hideHeader: isStatusCoTToggle,
                          }
                        )
                        : null}
                      {content}
                      {canCopyResponse ? (
                        <div class="ageaf-message__response-actions">
                          <button
                            class="ageaf-message__copy-response"
                            type="button"
                            aria-label="Copy response"
                            title="Copy response"
                            onClick={() => {
                              const copyId = `${message.id}-response`;
                              void (async () => {
                                const success = await copyToClipboard(
                                  copyResponseText
                                );
                                if (success) markCopied(copyId);
                              })();
                            }}
                          >
                            {copiedItems[`${message.id}-response`] ? (
                              <CheckIcon />
                            ) : (
                              <CopyIcon />
                            )}
                            <span>Copy response</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {streamingStatus ? (
                  <div class="ageaf-message ageaf-message--assistant ageaf-message--streaming">
                    {(() => {
                      const hasStreamingCoT = Boolean(
                        settings?.showThinkingAndTools && streamingCoT.length > 0
                      );
                      const isStreamingCoTToggle = Boolean(hasStreamingCoT);
                      const isStreamingCoTExpanded = isStreamingCoTToggle
                        ? expandedThinkingMessages.has('streaming-thinking')
                        : false;

                      return (
                        <>
                          {isStreamingCoTToggle ? (
                            <button
                              class={`ageaf-message__status ageaf-message__status--toggle ${isStreamingActive ? 'is-active' : ''
                                }`}
                              type="button"
                              aria-expanded={isStreamingCoTExpanded}
                              onClick={() =>
                                toggleThinkingExpanded('streaming-thinking')
                              }
                            >
                              <span class="ageaf-message__status-toggle-arrow">
                                {isStreamingCoTExpanded ? '▼' : '▶'}
                              </span>
                              <span class="ageaf-message__status-toggle-text">
                                {streamingStatus}
                              </span>
                            </button>
                          ) : (
                            <div
                              class={`ageaf-message__status ${isStreamingActive ? 'is-active' : ''
                                }`}
                            >
                              {streamingStatus}
                            </div>
                          )}
                          {hasStreamingCoT
                            ? renderCoTBlock(
                              streamingCoT,
                              isStreamingActive,
                              'streaming-thinking',
                              {
                                hideHeader: isStreamingCoTToggle,
                              }
                            )
                            : null}
                        </>
                      );
                    })()}
                    <div
                      class="ageaf-message__content"
                      ref={streamingContentRef}
                      style={streamingText ? undefined : { display: 'none' }}
                    />
                  </div>
                ) : null}
                {DEBUG_DIFF ? (
                  <div class="ageaf-message ageaf-message--system">
                    <DiffReview
                      oldText={'\\section{Intro}\\nWe write the paper here.'}
                      newText={'\\section{Introduction}\\nWe write the paper here.'}
                    />
                  </div>
                ) : null}
                {activeToolRequest ? (
                  <div class="ageaf-message ageaf-message--system">
                    {activeToolRequest.kind === 'approval' ? (
                      <div class="ageaf-toolcall">
                        <div class="ageaf-toolcall__title">Approval needed</div>
                        <div class="ageaf-toolcall__detail">
                          {activeToolRequest.params?.command
                            ? String(activeToolRequest.params.command)
                            : activeToolRequest.method}
                        </div>
                        <div class="ageaf-toolcall__actions">
                          <button
                            class="ageaf-panel__apply is-secondary"
                            type="button"
                            disabled={toolRequestBusy}
                            onClick={() => {
                              void respondToToolRequest(
                                activeToolRequest,
                                'decline'
                              );
                            }}
                          >
                            Decline
                          </button>
                          <button
                            class="ageaf-panel__apply"
                            type="button"
                            disabled={toolRequestBusy}
                            onClick={() => {
                              void respondToToolRequest(
                                activeToolRequest,
                                'accept'
                              );
                            }}
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    ) : (
                      <form
                        class="ageaf-toolcall"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const answers: Record<string, { answers: string[] }> = {};
                          for (const question of activeToolQuestions) {
                            const value = (
                              toolRequestInputs[question.id] ?? ''
                            ).trim();
                            answers[question.id] = {
                              answers: value ? [value] : [],
                            };
                          }
                          void respondToToolRequest(activeToolRequest, { answers });
                        }}
                      >
                        <div class="ageaf-toolcall__title">Input needed</div>
                        {activeToolQuestions.map((question) => (
                          <div class="ageaf-toolcall__question" key={question.id}>
                            {question.header ? (
                              <div class="ageaf-toolcall__question-title">
                                {question.header}
                              </div>
                            ) : null}
                            {question.question ? (
                              <div class="ageaf-toolcall__question-text">
                                {question.question}
                              </div>
                            ) : null}
                            {question.options ? (
                              <div class="ageaf-toolcall__options">
                                {question.options.map((option: any) => (
                                  <button
                                    class="ageaf-toolcall__option"
                                    type="button"
                                    key={option.label}
                                    onClick={() => {
                                      setToolRequestInputs((prev) => ({
                                        ...prev,
                                        [question.id]: option.label,
                                      }));
                                    }}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            <textarea
                              class="ageaf-toolcall__input"
                              rows={2}
                              value={toolRequestInputs[question.id] ?? ''}
                              onInput={(e) => {
                                const value = (
                                  e.currentTarget as HTMLTextAreaElement
                                ).value;
                                setToolRequestInputs((prev) => ({
                                  ...prev,
                                  [question.id]: value,
                                }));
                              }}
                              placeholder="Type your answer…"
                            />
                          </div>
                        ))}
                        <div class="ageaf-toolcall__actions">
                          <button
                            class="ageaf-panel__apply is-secondary"
                            type="button"
                            disabled={toolRequestBusy}
                            onClick={() => {
                              void respondToToolRequest(activeToolRequest, {
                                answers: Object.fromEntries(
                                  activeToolQuestions.map((question) => [
                                    question.id,
                                    { answers: [] },
                                  ])
                                ),
                              });
                            }}
                          >
                            Skip
                          </button>
                          <button
                            class="ageaf-panel__apply"
                            type="submit"
                            disabled={toolRequestBusy}
                          >
                            Submit
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : null}
                {!isAtBottom ? (
                  <button
                    class="ageaf-panel__scroll"
                    type="button"
                    onClick={scrollToBottom}
                  >
                    Scroll to bottom
                  </button>
                ) : null}
              </div>
              <div class="ageaf-runtime">
                <div class="ageaf-runtime__picker">
                  <button
                    class="ageaf-runtime__button"
                    type="button"
                    aria-haspopup="listbox"
                  >
                    <span class="ageaf-runtime__value">
                      {getSelectedModelLabel()}
                    </span>
                  </button>
                  <div class="ageaf-runtime__menu" role="listbox">
                    {getOrderedRuntimeModels().map((model) => (
                      <button
                        class={`ageaf-runtime__option ${isRuntimeModelSelected(model) ? 'is-selected' : ''
                          }`}
                        type="button"
                        onClick={() => onSelectModel(model.value)}
                        key={model.value}
                        aria-selected={isRuntimeModelSelected(model)}
                      >
                        <div class="ageaf-runtime__option-title">
                          {getRuntimeModelLabel(model)}
                        </div>
                        <div class="ageaf-runtime__option-description">
                          {getRuntimeModelDescription(model)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div class="ageaf-runtime__picker">
                  <button
                    class="ageaf-runtime__button"
                    type="button"
                    aria-haspopup="listbox"
                  >
                    <span class="ageaf-runtime__label">Thinking</span>
                    <span class="ageaf-runtime__value ageaf-runtime__value--accent">
                      {selectedThinkingMode.label}
                    </span>
                  </button>
                  <div class="ageaf-runtime__menu" role="listbox">
                    {thinkingModes.map((mode) => (
                      <button
                        class={`ageaf-runtime__option ${mode.id === currentThinkingMode ? 'is-selected' : ''
                          }`}
                        type="button"
                        onClick={() => onSelectThinkingMode(mode.id)}
                        key={mode.id}
                        aria-selected={mode.id === currentThinkingMode}
                      >
                        <div class="ageaf-runtime__option-title">{mode.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div class="ageaf-runtime__usage" data-tooltip={usageLabel}>
                  <svg
                    class="ageaf-runtime__ring"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <title>{usageLabel}</title>
                    <circle
                      class="ageaf-runtime__ring-track"
                      cx="12"
                      cy="12"
                      r="10"
                      strokeWidth="3"
                    />
                    <circle
                      class="ageaf-runtime__ring-value"
                      cx="12"
                      cy="12"
                      r="10"
                      strokeWidth="3"
                      ref={contextRingRef}
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringCircumference}
                    />
                  </svg>
                  <span class="ageaf-runtime__value">{usagePercent}%</span>
                </div>
                <button
                  class={`ageaf-runtime__yolo ${yoloMode ? 'is-on' : ''}`}
                  type="button"
                  role="switch"
                  aria-checked={yoloMode}
                  aria-label={
                    chatProvider === 'codex'
                      ? yoloMode
                        ? 'Codex YOLO mode enabled'
                        : 'Codex safe mode enabled'
                      : yoloMode
                        ? 'YOLO mode enabled'
                        : 'Safe mode enabled'
                  }
                  data-tooltip={yoloMode ? 'YOLO mode' : 'Safe mode'}
                  onClick={() => {
                    void onToggleYoloMode();
                  }}
                >
                  <span class="ageaf-runtime__yolo-text">
                    {yoloMode ? 'YOLO' : 'Safe'}
                  </span>
                  <span class="ageaf-runtime__yolo-switch" aria-hidden="true">
                    <span class="ageaf-runtime__yolo-thumb" />
                  </span>
                </button>
              </div>
            </>
          ) : (
            landingPage
          )}
        </div>
        {hasSessions ? (
          <div
            class="ageaf-panel__input"
            onDragEnter={(event) => handleDragEnter(event as DragEvent)}
            onDragOver={(event) => handleDragOver(event as DragEvent)}
            onDragLeave={(event) => handleDragLeave(event as DragEvent)}
            onDrop={(event) => handleDrop(event as DragEvent)}
          >
            <div class="ageaf-panel__toolbar">
              <div
                class="ageaf-session-tabs"
                role="tablist"
                aria-label="Sessions"
              >
                {sessionIds.map((id, index) => {
                  const state = chatStateRef.current;
                  const conversation = state ? findConversation(state, id) : null;
                  const providerLabel =
                    conversation?.provider === 'codex' ? 'OpenAI' : 'Anthropic';

                  // Get per-session activity status
                  const sessionState = sessionStates.current.get(id);
                  const isActive =
                    sessionState?.isSending ||
                    (sessionState?.queue.length ?? 0) > 0;
                  const statusIcon = sessionState?.isSending
                    ? '⟳' // spinning/thinking
                    : (sessionState?.queue.length ?? 0) > 0
                      ? `${sessionState?.queue.length ?? 0}` // queue count
                      : null;

                  return (
                    <button
                      class={`ageaf-session-tab ${id === activeSessionId ? 'is-active' : ''
                        } ${isActive ? 'is-busy' : ''}`}
                      type="button"
                      role="tab"
                      aria-selected={id === activeSessionId}
                      aria-label={`Session ${index + 1} (${providerLabel})`}
                      data-tooltip={providerLabel}
                      onClick={() => onSelectSession(id)}
                      key={id}
                    >
                      {index + 1}
                      {statusIcon && (
                        <span class="ageaf-session__status">{statusIcon}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div class="ageaf-toolbar-actions">
                <button
                  class="ageaf-toolbar-button"
                  type="button"
                  onClick={() => void onRewriteSelection()}
                  aria-label="Rewrite selection"
                  data-tooltip="Rewrite selection"
                >
                  <RewriteIcon />
                </button>
                <button
                  class="ageaf-toolbar-button"
                  type="button"
                  onClick={() => void onOpenFilePicker()}
                  aria-label="Attach files"
                  data-tooltip="Attach files"
                >
                  <AttachFilesIcon />
                </button>
                <div class="ageaf-toolbar-menu">
                  <button
                    class="ageaf-toolbar-button"
                    type="button"
                    aria-haspopup="menu"
                    aria-label="New chat"
                    data-tooltip="New chat"
                  >
                    <NewChatIconAlt />
                  </button>
                  <div
                    class="ageaf-toolbar-menu__list"
                    role="menu"
                    aria-label="Select provider"
                  >
                    <button
                      class="ageaf-toolbar-menu__option"
                      type="button"
                      onClick={() => void onNewChat('claude')}
                      role="menuitem"
                    >
                      Anthropic
                    </button>
                    <button
                      class="ageaf-toolbar-menu__option"
                      type="button"
                      onClick={() => void onNewChat('codex')}
                      role="menuitem"
                    >
                      OpenAI
                    </button>
                  </div>
                </div>
                <button
                  class="ageaf-toolbar-button"
                  type="button"
                  onClick={onClearChat}
                  aria-label="Clear chat"
                  data-tooltip="Clear chat"
                >
                  <ClearChatIcon />
                </button>
                <button
                  class="ageaf-toolbar-button"
                  type="button"
                  onClick={onCloseSession}
                  aria-label="Close session"
                  data-tooltip="Close session"
                >
                  <CloseSessionIcon />
                </button>
                <button
                  class="ageaf-panel__settings ageaf-toolbar-button"
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Open settings"
                  data-tooltip="Settings"
                >
                  <SettingsIcon />
                </button>
              </div>
            </div>
            {fileAttachments.length > 0 ? (
              <div
                class="ageaf-panel__file-attachments"
                aria-label="Attached files"
              >
                {fileAttachments.map((attachment) => (
                  <div
                    class="ageaf-panel__file-chip"
                    key={attachment.id}
                    title={attachment.path ?? attachment.name}
                  >
                    <span class="ageaf-panel__file-chip-name">
                      {truncateName(attachment.name)}
                    </span>
                    <span class="ageaf-panel__file-chip-meta">
                      {attachment.ext.replace('.', '').toUpperCase()} ·{' '}
                      {formatLineCount(attachment.lineCount)} lines
                    </span>
                    <button
                      class="ageaf-panel__file-chip-remove"
                      type="button"
                      aria-label={`Remove ${attachment.name}`}
                      onClick={() =>
                        updateFileAttachments(
                          fileAttachmentsRef.current.filter(
                            (item) => item.id !== attachment.id
                          )
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {imageAttachments.length > 0 ? (
              <div class="ageaf-panel__attachments" aria-label="Attached images">
                {imageAttachments.map((image) => (
                  <div class="ageaf-panel__attachment" key={image.id}>
                    <img
                      class="ageaf-panel__attachment-thumb"
                      src={getImageDataUrl(image)}
                      alt={image.name}
                      loading="lazy"
                    />
                    <div class="ageaf-panel__attachment-meta">
                      <div class="ageaf-panel__attachment-name">
                        {truncateName(image.name)}
                      </div>
                      <div class="ageaf-panel__attachment-size">
                        {formatBytes(image.size)}
                      </div>
                    </div>
                    <button
                      class="ageaf-panel__attachment-remove"
                      type="button"
                      aria-label={`Remove ${image.name}`}
                      onClick={() => removeImageAttachment(image.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {attachmentError ? (
              <div class="ageaf-panel__attachment-error">{attachmentError}</div>
            ) : null}
            <div
              class={`ageaf-panel__editor ${editorEmpty ? 'is-empty' : ''}`}
              contentEditable="true"
              role="textbox"
              aria-multiline="true"
              aria-label="Message input"
              data-placeholder="Ask anything (⌘K), @ to mention, / for workflows"
              ref={editorRef}
              onInput={() => {
                syncEditorEmpty();
                updateMentionState();
                void updateSkillState();
              }}
              onPaste={(event) => handlePaste(event as ClipboardEvent)}
              onKeyDown={(event) => onInputKeyDown(event as KeyboardEvent)}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
                updateMentionState();
                void updateSkillState();
              }}
            />
            {mentionOpen ? (
              <div
                class="ageaf-mention"
                ref={mentionListRef}
                onWheel={(event) => {
                  // Ensure the dropdown itself scrolls (trackpad wheel often scrolls the chat instead).
                  // We scroll manually to be robust across browsers' passive wheel defaults.
                  const el = event.currentTarget as HTMLElement | null;
                  if (!el) return;
                  if (el.scrollHeight <= el.clientHeight) return;
                  el.scrollTop += (event as unknown as WheelEvent).deltaY;
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {mentionResults.length > 0 ? (
                  mentionResults.map((file, index) => (
                    <button
                      key={file.path}
                      type="button"
                      class={`ageaf-mention__option ${index === mentionIndex ? 'is-active' : ''
                        }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertMentionEntry(file);
                      }}
                      title={file.path}
                    >
                      <span class={`ageaf-mention__icon is-${file.kind}`}>
                        {file.kind === 'folder'
                          ? 'Dir'
                          : file.kind === 'tex'
                            ? 'TeX'
                            : file.kind === 'bib'
                              ? 'Bib'
                              : file.kind === 'img'
                                ? 'Img'
                                : 'File'}
                      </span>
                      <span class="ageaf-mention__name">{file.name}</span>
                    </button>
                  ))
                ) : (
                  <div class="ageaf-mention__empty">No project files found.</div>
                )}
              </div>
            ) : null}
            {skillOpen ? (
              <div
                class="ageaf-skill"
                ref={skillListRef}
                onWheel={(event) => {
                  const el = event.currentTarget as HTMLElement | null;
                  if (!el) return;
                  if (el.scrollHeight <= el.clientHeight) return;
                  el.scrollTop += (event as unknown as WheelEvent).deltaY;
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {skillResults.length > 0 ? (
                  skillResults.map((skill, index) => (
                    <button
                      key={skill.id}
                      type="button"
                      class={`ageaf-skill__option ${index === skillIndex ? 'is-active' : ''
                        }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertSkill(skill);
                      }}
                      title={skill.description}
                    >
                      <div class="ageaf-skill__name">/{skill.name}</div>
                      <div class="ageaf-skill__description">
                        {skill.description}
                      </div>
                    </button>
                  ))
                ) : (
                  <div class="ageaf-skill__empty">No skills found.</div>
                )}
              </div>
            ) : null}
            {isDropActive ? (
              <div class="ageaf-panel__dropzone" aria-hidden="true">
                <svg
                  class="ageaf-panel__dropzone-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M12 16V7M8.5 10.5L12 7l3.5 3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.6"
                  />
                  <path
                    d="M5 17.5c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.6"
                  />
                </svg>
                <div class="ageaf-panel__dropzone-label">
                  Drop files to attach
                </div>
              </div>
            ) : null}
            {isSending || queueCount > 0 ? (
              <div class="ageaf-panel__queue">
                {isSending ? 'Sending…' : 'Queued'}
                {queueCount > 0 ? ` (${queueCount})` : ''}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {settingsOpen ? (
        <div class="ageaf-settings">
          <div
            class="ageaf-settings__backdrop"
            onClick={() => setSettingsOpen(false)}
          />
          <div
            class="ageaf-settings__panel"
            role="dialog"
            aria-label="Settings"
          >
            <div class="ageaf-settings__sidebar">
              <button
                class={`ageaf-settings__tab ${settingsTab === 'connection' ? 'is-active' : ''
                  }`}
                type="button"
                onClick={() => setSettingsTab('connection')}
              >
                Connection
              </button>
              <button
                class={`ageaf-settings__tab ${settingsTab === 'authentication' ? 'is-active' : ''
                  }`}
                type="button"
                onClick={() => setSettingsTab('authentication')}
              >
                Authentication
              </button>
              <button
                class={`ageaf-settings__tab ${settingsTab === 'customization' ? 'is-active' : ''
                  }`}
                type="button"
                onClick={() => setSettingsTab('customization')}
              >
                Customization
              </button>
              <button
                class={`ageaf-settings__tab ${settingsTab === 'tools' ? 'is-active' : ''
                  }`}
                type="button"
                onClick={() => setSettingsTab('tools')}
              >
                Tools
              </button>
              <button
                class={`ageaf-settings__tab ${settingsTab === 'safety' ? 'is-active' : ''
                  }`}
                type="button"
                onClick={() => setSettingsTab('safety')}
              >
                Safety
              </button>
            </div>
            <div class="ageaf-settings__content">
              {!settings ? (
                <div class="ageaf-settings__section">Loading...</div>
              ) : (
                <>
                  {settingsTab === 'connection' ? (
                    <div class="ageaf-settings__section">
                      <h3>Connection</h3>
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-transport-mode"
                      >
                        Transport
                      </label>
                      <select
                        id="ageaf-transport-mode"
                        class="ageaf-settings__input"
                        value={settings.transport ?? 'http'}
                        onChange={(event) =>
                          updateSettings({
                            transport: (
                              event.currentTarget as HTMLSelectElement
                            ).value as 'http' | 'native',
                          })
                        }
                      >
                        <option value="http">HTTP</option>
                        <option value="native">Native Messaging (prod)</option>
                      </select>
                      {settings.transport !== 'native' ? (
                        <>
                          <label
                            class="ageaf-settings__label"
                            for="ageaf-host-url"
                          >
                            Host URL
                          </label>
                          <input
                            id="ageaf-host-url"
                            class="ageaf-settings__input"
                            type="text"
                            value={settings.hostUrl ?? ''}
                            onInput={(event) =>
                              updateSettings({
                                hostUrl: (event.target as HTMLInputElement)
                                  .value,
                              })
                            }
                            placeholder="http://127.0.0.1:3210"
                          />
                        </>
                      ) : (
                        <>
                          <p class="ageaf-settings__hint">
                            Native messaging uses the installed companion app.
                          </p>
                          <p class="ageaf-settings__hint">
                            Native host status: {nativeStatus}
                          </p>
                          {nativeStatusError ? (
                            <p class="ageaf-settings__hint">
                              Native host error: {nativeStatusError}
                            </p>
                          ) : null}
                          <button
                            type="button"
                            class="ageaf-settings__button"
                            onClick={checkNativeHost}
                          >
                            Retry
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                  {settingsTab === 'authentication' ? (
                    <div class="ageaf-settings__section">
                      <h3>Authentication</h3>
                      <h4 class="ageaf-settings__subhead">Anthropic</h4>
                      <div
                        class="ageaf-settings__info-box"
                        style="background: rgba(57, 185, 138, 0.08); border: 1px solid rgba(57, 185, 138, 0.25); border-left: 4px solid #39b98a; padding: 12px; margin-bottom: 16px; border-radius: 6px;"
                      >
                        <strong>🔐 Secure API Key Input</strong>
                        <p style="margin: 8px 0 0 0; font-size: 13px; color: #dbe6e0;">
                          Enter your API key here for use with Claude CLI. The
                          key is kept in memory only and never saved to browser
                          storage. You'll need to re-enter it after browser
                          restart.
                        </p>
                        <p style="margin: 8px 0 0 0; font-size: 13px; color: #dbe6e0;">
                          <strong>Alternatively:</strong> Set ANTHROPIC_API_KEY
                          in your terminal environment and leave this field
                          empty.
                        </p>
                      </div>
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-claude-api-key"
                      >
                        API Key (Session Only - Not Saved)
                      </label>
                      <div
                        style="display: flex; gap: 8px; margin-bottom: 16px;"
                      >
                        <input
                          id="ageaf-claude-api-key"
                          class="ageaf-settings__input"
                          type={showClaudeKey ? 'text' : 'password'}
                          value={claudeApiKey}
                          onInput={(event) =>
                            setClaudeApiKey(
                              (event.target as HTMLInputElement).value
                            )
                          }
                          onPaste={(event) =>
                            setClaudeApiKey(
                              event.clipboardData?.getData('text') || ''
                            )
                          }
                          placeholder="sk-ant-... (optional if set in terminal)"
                          style="flex: 1;"
                        />
                        <button
                          type="button"
                          class="ageaf-settings__button"
                          onClick={() => setShowClaudeKey(!showClaudeKey)}
                          style="min-width: 80px;"
                        >
                          {showClaudeKey ? 'Hide' : 'Show'}
                        </button>
                        {claudeApiKey && (
                          <button
                            type="button"
                            class="ageaf-settings__button"
                            onClick={() => setClaudeApiKey('')}
                            style="min-width: 80px;"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-claude-cli"
                      >
                        Claude CLI path (optional)
                      </label>
                      <input
                        id="ageaf-claude-cli"
                        class="ageaf-settings__input"
                        type="text"
                        value={settings.claudeCliPath ?? ''}
                        onInput={(event) =>
                          updateSettings({
                            claudeCliPath: (event.target as HTMLInputElement)
                              .value,
                          })
                        }
                        placeholder="Leave empty to auto-detect"
                      />
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-claude-env"
                      >
                        Environment variables (KEY=VALUE)
                      </label>
                      <p class="ageaf-settings__hint">
                        <strong>Note:</strong> Use the API Key field above for
                        sensitive keys. This field is for non-sensitive
                        variables like ANTHROPIC_BASE_URL or ANTHROPIC_MODEL.
                      </p>
                      <textarea
                        id="ageaf-claude-env"
                        class="ageaf-settings__textarea"
                        rows={6}
                        value={settings.claudeEnvVars ?? ''}
                        onInput={(event) =>
                          updateSettings({
                            claudeEnvVars: (event.target as HTMLTextAreaElement)
                              .value,
                          })
                        }
                        placeholder={
                          'ANTHROPIC_BASE_URL=https://api.anthropic.com\nANTHROPIC_MODEL=claude-sonnet-4-5'
                        }
                      />
                      {detectApiKeyInEnvVars(settings.claudeEnvVars) && (
                        <div
                          class="ageaf-settings__warning-box"
                          style="background: rgba(255, 179, 87, 0.08); border: 1px solid rgba(255, 179, 87, 0.25); border-left: 4px solid #ffb357; padding: 12px; margin-top: 12px; margin-bottom: 12px; border-radius: 6px;"
                        >
                          <strong>⚠️ API Key Detected in Environment Variables</strong>
                          <p style="margin: 8px 0 0 0; font-size: 13px; color: #dbe6e0;">
                            You appear to have entered an API key in the
                            environment variables field. For better security, use
                            the "API Key" field above instead. Keys entered there
                            are kept in memory only and never saved.
                          </p>
                        </div>
                      )}
                      <label class="ageaf-settings__checkbox">
                        <input
                          type="checkbox"
                          checked={settings.claudeLoadUserSettings ?? false}
                          onChange={(event) =>
                            updateSettings({
                              claudeLoadUserSettings:
                                event.currentTarget.checked,
                            })
                          }
                        />
                        Load ~/.claude/settings.json (user permissions)
                      </label>
                      <h4 class="ageaf-settings__subhead">OpenAI</h4>
                      <div
                        class="ageaf-settings__info-box"
                        style="background: rgba(57, 185, 138, 0.08); border: 1px solid rgba(57, 185, 138, 0.25); border-left: 4px solid #39b98a; padding: 12px; margin-bottom: 16px; border-radius: 6px;"
                      >
                        <strong>🔐 Secure API Key Input</strong>
                        <p style="margin: 8px 0 0 0; font-size: 13px; color: #dbe6e0;">
                          Enter your API key here for use with Codex CLI. The
                          key is kept in memory only and never saved to browser
                          storage. You'll need to re-enter it after browser
                          restart.
                        </p>
                        <p style="margin: 8px 0 0 0; font-size: 13px; color: #dbe6e0;">
                          <strong>Alternatively:</strong> Set OPENAI_API_KEY in
                          your terminal environment and leave this field empty.
                        </p>
                      </div>
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-openai-api-key"
                      >
                        API Key (Session Only - Not Saved)
                      </label>
                      <div
                        style="display: flex; gap: 8px; margin-bottom: 16px;"
                      >
                        <input
                          id="ageaf-openai-api-key"
                          class="ageaf-settings__input"
                          type={showOpenaiKey ? 'text' : 'password'}
                          value={openaiApiKey}
                          onInput={(event) =>
                            setOpenaiApiKey(
                              (event.target as HTMLInputElement).value
                            )
                          }
                          onPaste={(event) =>
                            setOpenaiApiKey(
                              event.clipboardData?.getData('text') || ''
                            )
                          }
                          placeholder="sk-... (optional if set in terminal)"
                          style="flex: 1;"
                        />
                        <button
                          type="button"
                          class="ageaf-settings__button"
                          onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                          style="min-width: 80px;"
                        >
                          {showOpenaiKey ? 'Hide' : 'Show'}
                        </button>
                        {openaiApiKey && (
                          <button
                            type="button"
                            class="ageaf-settings__button"
                            onClick={() => setOpenaiApiKey('')}
                            style="min-width: 80px;"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-codex-cli"
                      >
                        Codex CLI path (optional)
                      </label>
                      <input
                        id="ageaf-codex-cli"
                        class="ageaf-settings__input"
                        type="text"
                        value={settings.openaiCodexCliPath ?? ''}
                        onInput={(event) =>
                          updateSettings({
                            openaiCodexCliPath: (
                              event.target as HTMLInputElement
                            ).value,
                          })
                        }
                        placeholder="Leave empty to auto-detect"
                      />
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-openai-env"
                      >
                        Environment variables (KEY=VALUE)
                      </label>
                      <p class="ageaf-settings__hint">
                        <strong>Note:</strong> Use the API Key field above for
                        sensitive keys. This field is for non-sensitive
                        variables like OPENAI_BASE_URL.
                      </p>
                      <textarea
                        id="ageaf-openai-env"
                        class="ageaf-settings__textarea"
                        rows={6}
                        value={settings.openaiEnvVars ?? ''}
                        onInput={(event) =>
                          updateSettings({
                            openaiEnvVars: (event.target as HTMLTextAreaElement)
                              .value,
                          })
                        }
                        placeholder={
                          'OPENAI_BASE_URL=https://api.openai.com'
                        }
                      />
                      {detectApiKeyInEnvVars(settings.openaiEnvVars) && (
                        <div
                          class="ageaf-settings__warning-box"
                          style="background: rgba(255, 179, 87, 0.08); border: 1px solid rgba(255, 179, 87, 0.25); border-left: 4px solid #ffb357; padding: 12px; margin-top: 12px; margin-bottom: 12px; border-radius: 6px;"
                        >
                          <strong>⚠️ API Key Detected in Environment Variables</strong>
                          <p style="margin: 8px 0 0 0; font-size: 13px; color: #dbe6e0;">
                            You appear to have entered an API key in the
                            environment variables field. For better security, use
                            the "API Key" field above instead. Keys entered there
                            are kept in memory only and never saved.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {settingsTab === 'customization' ? (
                    <div class="ageaf-settings__section">
                      <h3>Customization</h3>
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-display-name"
                      >
                        What should Ageaf call you?
                      </label>
                      <input
                        id="ageaf-display-name"
                        class="ageaf-settings__input"
                        type="text"
                        value={settings.displayName ?? ''}
                        onInput={(event) =>
                          updateSettings({
                            displayName: (event.target as HTMLInputElement)
                              .value,
                          })
                        }
                        placeholder="Leave blank for generic greetings"
                      />
                      <p class="ageaf-settings__hint">
                        Used for personalized greetings. Leave blank for generic
                        greetings.
                      </p>
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-custom-prompt"
                      >
                        Custom system prompt
                      </label>
                      <textarea
                        id="ageaf-custom-prompt"
                        class="ageaf-settings__textarea"
                        rows={8}
                        value={settings.customSystemPrompt ?? ''}
                        onInput={(event) =>
                          updateSettings({
                            customSystemPrompt: (
                              event.target as HTMLTextAreaElement
                            ).value,
                          })
                        }
                        placeholder="Additional instructions appended to the default system prompt..."
                      />
                      <p class="ageaf-settings__hint">
                        Additional instructions appended to the default system
                        prompt.
                      </p>
                    </div>
                  ) : null}
                  {settingsTab === 'tools' ? (
                    <div class="ageaf-settings__section">
                      <h3>Tools</h3>
                      <label class="ageaf-settings__checkbox">
                        <input
                          type="checkbox"
                          checked={settings.enableTools ?? false}
                          onChange={(event) => {
                            const next = event.currentTarget.checked;
                            updateSettings({ enableTools: next });
                            if (!settings.hostUrl) {
                              setSettingsMessage('Host URL not configured');
                              return;
                            }
                            void (async () => {
                              try {
                                await setHostToolsEnabled(settings, next);
                                setSettingsMessage(
                                  next
                                    ? 'Host tools enabled'
                                    : 'Host tools disabled'
                                );
                              } catch (error) {
                                const message =
                                  error instanceof Error
                                    ? error.message
                                    : 'Failed to update host tools';
                                setSettingsMessage(message);
                              } finally {
                                await refreshHostToolsStatus(settings);
                              }
                            })();
                          }}
                        />
                        Enable tools (Bash / file tools)
                      </label>
                      <p class="ageaf-settings__hint">
                        When enabled, Ageaf may request to run local commands
                        (Bash) or read files via the host runtime. This toggle
                        updates both the extension and the host setting.
                      </p>
                      <p class="ageaf-settings__hint">
                        Host status:{' '}
                        {hostToolsStatus
                          ? `tools=${hostToolsStatus.toolsEnabled ? 'on' : 'off'
                          }, remote-toggle=${hostToolsStatus.remoteToggleAllowed
                            ? 'allowed'
                            : 'blocked'
                          }, available=${hostToolsStatus.toolsAvailable ? 'yes' : 'no'
                          }`
                          : 'unavailable'}
                      </p>
                      {!hostToolsStatus?.remoteToggleAllowed ? (
                        <p class="ageaf-settings__hint">
                          To allow the extension to control host tools, restart
                          the host with AGEAF_ALLOW_REMOTE_TOOL_TOGGLE=true.
                        </p>
                      ) : null}
                      {!hostToolsStatus?.toolsAvailable ? (
                        <p class="ageaf-settings__hint">
                          Tools are not available. Restart the host with
                          AGEAF_ENABLE_TOOLS=true to permit tool execution.
                        </p>
                      ) : null}
                      <p class="ageaf-settings__hint">
                        Tip: keep this off unless you explicitly need tool use.
                        You can still chat normally with tools disabled.
                      </p>
                      <h4 class="ageaf-settings__subhead">OpenAI</h4>
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-openai-approval-policy"
                      >
                        Approval policy
                      </label>
                      <select
                        id="ageaf-openai-approval-policy"
                        class="ageaf-settings__input"
                        value={settings.openaiApprovalPolicy ?? 'never'}
                        onChange={(event) =>
                          updateSettings({
                            openaiApprovalPolicy: (
                              event.currentTarget as HTMLSelectElement
                            ).value as Options['openaiApprovalPolicy'],
                          })
                        }
                      >
                        <option value="untrusted">untrusted</option>
                        <option value="on-request">on-request</option>
                        <option value="on-failure">on-failure</option>
                        <option value="never">never</option>
                      </select>
                      <p class="ageaf-settings__hint">
                        Controls Codex CLI command approvals (approvalPolicy).
                        Use "never" only if you trust the agent to run commands
                        without prompting.
                      </p>

                      <label
                        class="ageaf-settings__label"
                        for="ageaf-surrounding-context-limit"
                      >
                        Surrounding context limit (chars)
                      </label>
                      <input
                        type="number"
                        id="ageaf-surrounding-context-limit"
                        class="ageaf-settings__input"
                        value={settings.surroundingContextLimit ?? 0}
                        min="0"
                        step="100"
                        onChange={(event) =>
                          updateSettings({
                            surroundingContextLimit: Math.max(
                              0,
                              parseInt(event.currentTarget.value) || 0
                            ),
                          })
                        }
                      />
                      <p class="ageaf-settings__hint">
                        Max characters of surrounding context (before/after
                        selection) to send to agents. 0 disables it (recommended
                        for CLI agents).
                      </p>

                      <h4 class="ageaf-settings__subhead">Compaction</h4>
                      <label class="ageaf-settings__checkbox">
                        <input
                          type="checkbox"
                          checked={settings.autoCompactEnabled ?? true}
                          onChange={(event) =>
                            updateSettings({
                              autoCompactEnabled: event.currentTarget.checked,
                            })
                          }
                        />
                        Auto-compact when context usage is high
                      </label>
                      <p class="ageaf-settings__hint">
                        When enabled, the host will check context usage and may
                        issue /compact before sending your request.
                      </p>

                      <h4 class="ageaf-settings__subhead">Display</h4>
                      <label class="ageaf-settings__checkbox">
                        <input
                          type="checkbox"
                          checked={settings.showThinkingAndTools ?? false}
                          onChange={(event) =>
                            updateSettings({
                              showThinkingAndTools: event.currentTarget.checked,
                            })
                          }
                        />
                        Show thinking and tool activity
                      </label>
                      <p class="ageaf-settings__hint">
                        When enabled, shows thinking blocks and tool activity
                        during responses.
                      </p>

                      <h4 class="ageaf-settings__subhead">Debugging</h4>
                      <label class="ageaf-settings__checkbox">
                        <input
                          type="checkbox"
                          checked={settings.debugCliEvents ?? false}
                          onChange={(event) =>
                            updateSettings({
                              debugCliEvents: event.currentTarget.checked,
                            })
                          }
                        />
                        Debug CLI events
                      </label>
                      <p class="ageaf-settings__hint">
                        When enabled, streams low-level runtime trace events into
                        chat (useful for debugging).
                      </p>
                    </div>
                  ) : null}
                  {settingsTab === 'safety' ? (
                    <div class="ageaf-settings__section">
                      <h3>Safety</h3>
                      <label class="ageaf-settings__checkbox">
                        <input
                          type="checkbox"
                          checked={settings.enableCommandBlocklist ?? false}
                          onChange={(event) =>
                            updateSettings({
                              enableCommandBlocklist:
                                event.currentTarget.checked,
                            })
                          }
                        />
                        Enable command blocklist
                      </label>
                      <p class="ageaf-settings__hint">
                        Blocks potentially dangerous bash commands before
                        execution.
                      </p>
                      <label
                        class="ageaf-settings__label"
                        for="ageaf-blocked-commands"
                      >
                        Blocked commands (Unix)
                      </label>
                      <textarea
                        id="ageaf-blocked-commands"
                        class="ageaf-settings__textarea"
                        rows={6}
                        value={settings.blockedCommandsUnix ?? ''}
                        onInput={(event) =>
                          updateSettings({
                            blockedCommandsUnix: (
                              event.target as HTMLTextAreaElement
                            ).value,
                          })
                        }
                        placeholder="rm -rf&#10;chmod 777&#10;chmod -R 777"
                      />
                      <p class="ageaf-settings__hint">
                        Patterns to block on Unix, one per line. Supports regex.
                      </p>
                    </div>
                  ) : null}
                </>
              )}
              <div class="ageaf-settings__actions">
                <button
                  class="ageaf-settings__button"
                  type="button"
                  onClick={onSaveSettings}
                  disabled={!settings}
                >
                  Save
                </button>
                <button
                  class="ageaf-settings__button is-secondary"
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                >
                  Close
                </button>
                {settingsMessage ? (
                  <span class="ageaf-settings__status">{settingsMessage}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </aside >
  );
};

// Export helper functions for use by citation indicator
export { Panel };
export const detectProjectFilesHeuristic = (): OverleafEntry[] => {
  const entries: OverleafEntry[] = [];
  const seen = new Set<string>();

  const extractFilenameFromLabel = (raw: string): string | null => {
    let value = raw.trim();
    if (!value) return null;
    value = value.replace(/\*+$/, '').trim(); // unsaved marker
    value = value.replace(/\s*\(.*?\)\s*$/, '').trim(); // trailing "(...)" metadata
    if (!value) return null;

    // Prefer known Overleaf-relevant file extensions; tab labels often include counts (e.g. "main.tex 5").
    const matches = value.match(
      /[A-Za-z0-9_./-]+\.(?:tex|bib|sty|cls|md|json|ya?ml|csv|xml|png|jpe?g|gif|svg|pdf|toml|ini|log|txt)\b/gi
    );
    if (!matches || matches.length === 0) return null;
    return matches[matches.length - 1] ?? null;
  };

  const normalizeLabel = (raw: string): string => {
    let s = raw.trim();
    if (!s) return '';
    s = s.replace(/\*+$/, '').trim(); // unsaved marker
    s = s.replace(/\s*\(.*?\)\s*$/, '').trim(); // trailing "(...)" metadata
    return s;
  };

  const basename = (p: string) => {
    const parts = p.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1]! : p;
  };

  const isFolderLike = (el: Element) => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.getAttribute('aria-expanded') != null) return true;
    const dt = el.getAttribute('data-type');
    if (dt === 'folder') return true;
    const cn = (el.className ?? '').toString();
    return /\bfolder\b/i.test(cn);
  };

  const addEntry = (entry: OverleafEntry) => {
    const key = `${entry.path}:${entry.kind}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  // Scan tabs + file tree nodes (same broad selectors as editorBridge.findClickableByName)
  const nodes = Array.from(
    document.querySelectorAll(
      [
        '[role="tab"]',
        '.cm-tab',
        '.cm-tab-label',
        '[role="treeitem"]',
        '[data-file-id]',
        '[data-testid="file-name"]',
        '.file-tree-item-name',
        '.file-name',
        '.entity-name',
        '.file-label',
      ].join(', ')
    )
  );

  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest('#ageaf-panel-root')) continue;
    // Skip folder nodes in the tree
    if (node.getAttribute('role') === 'treeitem' && isFolderLike(node))
      continue;

    const raw = (
      node.getAttribute('aria-label') ||
      node.getAttribute('title') ||
      node.textContent ||
      ''
    ).trim();
    const text = normalizeLabel(raw);
    if (!text) continue;

    const extracted = extractFilenameFromLabel(text);
    if (!extracted) continue;

    const base = basename(extracted);
    const ext = base.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
    if (!ext) continue;
    const kind =
      ext === 'tex'
        ? 'tex'
        : ext === 'bib'
          ? 'bib'
          : ext.match(/png|jpg|jpeg|pdf|svg/)
            ? 'img'
            : 'other';

    // Prefer extracting Overleaf entity id/type from the file tree markup
    // (file tree nodes contain a descendant with `data-file-id`).
    const idNode = node.matches?.('[data-file-id]')
      ? node
      : (node.querySelector?.('[data-file-id]') as HTMLElement | null);
    const id = idNode?.getAttribute?.('data-file-id')?.trim() || undefined;
    const entityType =
      idNode?.getAttribute?.('data-file-type')?.trim() || undefined;

    addEntry({
      path: extracted,
      name: base,
      ext,
      kind,
      ...(id ? { id } : {}),
      ...(entityType ? { entityType } : {}),
    });
  }

  return entries;
};
