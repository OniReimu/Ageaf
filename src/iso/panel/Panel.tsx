import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import {
  createJob,
  fetchClaudeRuntimeContextUsage,
  fetchClaudeRuntimeMetadata,
  fetchCodexRuntimeContextUsage,
  fetchCodexRuntimeMetadata,
  fetchHostToolsStatus,
  respondToJobRequest,
  setHostToolsEnabled,
  streamJobEvents,
  updateClaudeRuntimePreferences,
} from '../api/client';
import { getOptions } from '../../utils/helper';
import { LOCAL_STORAGE_KEY_OPTIONS } from '../../constants';
import { Options } from '../../types';
import { renderMarkdown } from './markdown';
import {
  ProviderId,
  StoredConversation,
  StoredContextUsage,
  StoredMessage,
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

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 560;
const DEFAULT_MODEL_VALUE = 'sonnet';
const DEFAULT_MODEL_LABEL = 'Sonnet';
const INTERRUPTED_BY_USER_MARKER = 'INTERRUPTED BY USER';

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
  { id: 'medium', label: 'Medium', maxThinkingTokens: 4096 },
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

function getThinkingModeIdForCodexEffort(effort: string | null | undefined): ThinkingMode['id'] {
  const normalized = (effort ?? '').trim().toLowerCase();
  return CODEX_EFFORT_TO_THINKING_MODE[normalized] ?? 'off';
}

function getCodexEffortForThinkingMode(modeId: ThinkingMode['id'], model: RuntimeModel | null) {
  const supported =
    model?.supportedReasoningEfforts?.map((entry) => String(entry.reasoningEffort ?? '').trim()) ??
    [];
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
};

type QueuedMessage = {
  text: string;
};

type Patch = {
  kind: 'replaceSelection' | 'insertAtCursor';
  text: string;
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
};

type RuntimeModel = {
  value: string;
  displayName: string;
  description: string;
  supportedReasoningEfforts?: Array<{ reasoningEffort: string; description: string }>;
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

type HostToolsStatus = {
  toolsEnabled: boolean;
  toolsAvailable: boolean;
  remoteToggleAllowed: boolean;
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
  const [patch, setPatch] = useState<Patch | null>(null);
  const [toolRequests, setToolRequests] = useState<ToolRequest[]>([]);
  const [toolRequestInputs, setToolRequestInputs] = useState<Record<string, string>>({});
  const [toolRequestBusy, setToolRequestBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    'connection' | 'authentication' | 'tools' | 'customization' | 'safety'
  >('connection');
  const [settings, setSettings] = useState<Options | null>(null);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [hostToolsStatus, setHostToolsStatus] = useState<HostToolsStatus | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const [runtimeModels, setRuntimeModels] = useState<RuntimeModel[]>([]);
  const [thinkingModes, setThinkingModes] = useState<ThinkingMode[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentThinkingMode, setCurrentThinkingMode] = useState('off');
  const [currentThinkingTokens, setCurrentThinkingTokens] = useState<number | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [yoloMode, setYoloMode] = useState(true);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const pendingWidthRef = useRef(DEFAULT_WIDTH);
  const resizeFrameRef = useRef<number | null>(null);
  const streamingTextRef = useRef('');
  const isSendingRef = useRef(false);
  const queueRef = useRef<QueuedMessage[]>([]);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const streamTokensRef = useRef<string[]>([]);
  const streamTimerRef = useRef<number | null>(null);
  const pendingDoneRef = useRef<{ status: string; message?: string } | null>(null);
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
  const chatSaveTimerRef = useRef<number | null>(null);
  const contextRefreshInFlightRef = useRef(false);

  const providerDisplay = PROVIDER_DISPLAY[chatProvider] ?? PROVIDER_DISPLAY.claude;
  const providerIndicatorClass =
    chatProvider === 'codex' ? 'ageaf-provider--openai' : 'ageaf-provider--anthropic';

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
    setContextUsage({
      usedTokens: stored.usedTokens,
      contextWindow: stored.contextWindow,
      percentage: stored.percentage,
    });
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
    state.providers.claude.conversations.find((conversation) => conversation.id === conversationId) ??
    state.providers.codex.conversations.find((conversation) => conversation.id === conversationId) ??
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
      if (event.key === 'Escape') {
        if (!isSendingRef.current && streamTimerRef.current == null) return;
        event.preventDefault();
        interruptInFlightJob();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

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
          : (options.claudeYoloMode ?? true)
      );

      const conversationId = chatConversationIdRef.current;
      const state = chatStateRef.current;
      const conversation = conversationId && state ? findConversation(state, conversationId) : null;
      setContextUsageFromStored(getCachedStoredUsage(conversation, chatProvider));

      if (!options.hostUrl) {
        setRuntimeModels([]);
        if (chatProvider === 'codex') {
          setThinkingModes(
            FALLBACK_THINKING_MODES.map((mode) => ({ ...mode, maxThinkingTokens: null }))
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
          const metadata = await fetchCodexRuntimeMetadata(options);
          if (cancelled) return;
          const models = metadata.models ?? [];
          setRuntimeModels(models);
          const resolvedModel =
            metadata.currentModel ??
            models.find((model) => model.isDefault)?.value ??
            models[0]?.value ??
            null;
          setCurrentModel(resolvedModel);
          const selectedModel =
            (resolvedModel ? models.find((model) => model.value === resolvedModel) : undefined) ??
            models.find((model) => model.isDefault) ??
            models[0] ??
            null;
          const supportedEfforts: Array<{ reasoningEffort: string; description: string }> =
            selectedModel?.supportedReasoningEfforts ?? [];
          const supportedModes = new Set(
            supportedEfforts.map((entry: { reasoningEffort: string; description: string }) =>
              getThinkingModeIdForCodexEffort(String(entry.reasoningEffort ?? ''))
            )
          );
          const nextThinkingModes = FALLBACK_THINKING_MODES.map((mode) => ({
            ...mode,
            maxThinkingTokens: null,
          })).filter((mode) => supportedModes.has(mode.id));
          setThinkingModes(
            nextThinkingModes.length > 0 ? nextThinkingModes : FALLBACK_THINKING_MODES
          );
          const effort =
            metadata.currentReasoningEffort ?? selectedModel?.defaultReasoningEffort ?? null;
          setCurrentThinkingMode(getThinkingModeIdForCodexEffort(effort));
          setCurrentThinkingTokens(null);
          setYoloMode((options.openaiApprovalPolicy ?? 'never') === 'never');
          void refreshContextUsage({ provider: 'codex', conversationId });
          return;
        }

        const metadata = await fetchClaudeRuntimeMetadata(options);
        if (cancelled) return;
        setRuntimeModels(metadata.models ?? []);
        setThinkingModes(metadata.thinkingModes ?? FALLBACK_THINKING_MODES);
        setCurrentModel(metadata.currentModel ?? options.claudeModel ?? DEFAULT_MODEL_VALUE);
        setCurrentThinkingMode(
          metadata.currentThinkingMode ?? options.claudeThinkingMode ?? 'off'
        );
        setCurrentThinkingTokens(metadata.maxThinkingTokens ?? options.claudeMaxThinkingTokens ?? null);
        setYoloMode(options.claudeYoloMode ?? true);
        void refreshContextUsage({ provider: 'claude', conversationId });
      } catch {
        if (cancelled) return;
        setRuntimeModels([]);
        if (chatProvider === 'codex') {
          setThinkingModes(
            FALLBACK_THINKING_MODES.map((mode) => ({ ...mode, maxThinkingTokens: null }))
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
    return () => {
      cancelled = true;
    };
  }, [chatProvider]);

  useEffect(() => {
    if (!settingsOpen) return;
    getOptions().then((options) => {
      setSettings(options);
      setSettingsMessage('');
    });
  }, [settingsOpen]);

  useEffect(() => {
    const onOpenSettings = () => setSettingsOpen(true);
    window.addEventListener('ageaf:settings:open', onOpenSettings as EventListener);
    return () => {
      window.removeEventListener('ageaf:settings:open', onOpenSettings as EventListener);
    };
  }, []);

  useEffect(() => {
    const chat = chatRef.current;
    if (!chat) return;
    const onScroll = () => {
      const distance = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
      const atBottom = distance <= 24;
      if (isAtBottomRef.current !== atBottom) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
    };
    onScroll();
    chat.addEventListener('scroll', onScroll);
    return () => chat.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!chatRef.current || !isAtBottomRef.current) return;
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, streamingText, patch]);

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
    chat.scrollTop = chat.scrollHeight;
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  };

  const setStreamingState = (text: string | null, active: boolean) => {
    setStreamingStatus(text);
    setIsStreamingActive(active);
  };

  const formatTokenCount = (value: number) => {
    if (value >= 1000) {
      return `${Math.floor(value / 1000)}k`;
    }
    return String(value);
  };

  const createMessageId = () => {
    messageCounterRef.current += 1;
    return `msg-${Date.now()}-${messageCounterRef.current}`;
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

  const hydrateChatForProject = async (projectId: string, isActive: () => boolean) => {
    const stored = await loadProjectChat(projectId);
    if (!isActive()) return;
    const provider = stored.activeProvider;
    const { state: ensured, conversation } = ensureActiveConversation(stored, provider);

    chatProjectIdRef.current = projectId;
    chatConversationIdRef.current = conversation.id;
    chatStateRef.current = ensured;
    setChatProvider(provider);
    setSessionIds(getOrderedSessionIds(ensured));
    setActiveSessionId(conversation.id);

    setPatch(null);
    setStreamingState(null, false);
    setStreamingText('');
    streamingTextRef.current = '';
    streamTokensRef.current = [];
    pendingDoneRef.current = null;
    stopStreamTimer();
    stopThinkingTimer();

    setContextUsageFromStored(getCachedStoredUsage(conversation, provider));
    void refreshContextUsage({ provider, conversationId: conversation.id });

    setMessages(conversation.messages.map((message) => createMessage(message)));
    scheduleChatSave();
  };

  useEffect(() => {
    let active = true;
    let lastProjectId: string | null = null;

    const tick = async () => {
      const projectId = getOverleafProjectIdFromPathname(window.location.pathname);
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
    const projectId = chatProjectIdRef.current;
    const conversationId = chatConversationIdRef.current;
    const state = chatStateRef.current;
    if (!projectId || !conversationId || !state) return;
    const next = setConversationMessages(state, chatProvider, conversationId, toStoredMessages(messages));
    chatStateRef.current = next;
    scheduleChatSave();
  }, [messages, chatProvider]);

  const ATTACHMENT_LABEL_REGEX = /^\[Attachment: .+ · \d+ lines\]$/;

  const extractQuotesFromHtml = (html: string) => {
    if (typeof document === 'undefined') {
      return { mainHtml: html, quotes: [] as string[] };
    }

    const container = document.createElement('div');
    container.innerHTML = html;
    const mainContainer = document.createElement('div');
    const quotes: string[] = [];
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
          quotes.push(element.outerHTML);
          continue;
        }

        if (element.tagName === 'P') {
          const text = element.textContent?.trim() ?? '';
          if (text === INTERRUPTED_BY_USER_MARKER) {
            element.classList.add('ageaf-message__interrupt');
          }
          if (ATTACHMENT_LABEL_REGEX.test(text)) {
            const nextIndex = findNextElementIndex(i + 1);
            if (nextIndex !== -1) {
              const nextNode = nodes[nextIndex] as HTMLElement;
              if (nextNode.tagName === 'PRE') {
                quotes.push(nextNode.outerHTML);
                i = nextIndex;
                continue;
              }
            }
          }
        }
      }

      mainContainer.appendChild(node.cloneNode(true));
    }

    return { mainHtml: mainContainer.innerHTML, quotes };
  };

  const createChipId = () => {
    chipCounterRef.current += 1;
    return `chip-${Date.now()}-${chipCounterRef.current}`;
  };

  const getActiveFilename = () => {
    const selectors = [
      '[data-testid="file-name"]',
      '.file-tree .selected .name',
      '.file-tree .selected',
      '.file-tree-item.is-selected .file-tree-item-name',
      '.file-tree-item.selected .file-tree-item-name',
      '.file-tree-item.is-selected',
      '.file-tree-item.selected',
      '.cm-tab.selected',
      '.cm-tab.active',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const text = el.textContent?.trim();
      if (!text) continue;
      if (text.length > 120) continue;
      return text;
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

  const serializeChipPayload = (payload: ChipPayload) => {
    const label = `[Attachment: ${payload.filename} · ${payload.lineCount} lines]`;
    const language = getFenceLanguage(payload.filename);
    const fence = language ? `\`\`\`${language}` : '```';
    return `\n${label}\n${fence}\n${payload.text}\n\`\`\`\n`;
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
    const editor = editorRef.current;
    if (!editor) return;
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
    const text = (editor.textContent ?? '').replace(/\u200B/g, '').trim();
    setEditorEmpty(!hasChip && text.length === 0);
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

  const insertChipFromText = (text: string, filenameOverride?: string) => {
    if (!text) return;
    const filename = filenameOverride ?? getActiveFilename() ?? 'snippet.tex';
    const lineCount = getLineCount(text);
    const chipId = createChipId();
    const payload: ChipPayload = { text, filename, lineCount };
    chipStoreRef.current = { ...chipStoreRef.current, [chipId]: payload };

    const chip = document.createElement('span');
    chip.className = 'ageaf-panel__chip';
    chip.setAttribute('data-chip-id', chipId);
    chip.dataset.chipId = chipId;
    chip.dataset.filename = filename;
    chip.dataset.lines = String(lineCount);
    chip.setAttribute('aria-label', `${filename} (${lineCount})`);
    chip.setAttribute('contenteditable', 'false');
    chip.textContent = `📄 ${filename} (${lineCount})`;
    insertNodeAtCursor(chip);
  };

  const shouldChipPaste = (text: string) => {
    if (text.length > 200) return true;
    return /[\r\n]/.test(text);
  };

  const handlePaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain');
    if (text == null) return;
    event.preventDefault();
    if (shouldChipPaste(text)) {
      insertChipFromText(text);
    } else {
      insertTextAtCursor(text);
    }
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
      const sibling = direction === 'backward' ? textNode.previousSibling : textNode.nextSibling;
      if (sibling instanceof HTMLElement && sibling.dataset?.chipId) {
        target = sibling;
      }
    } else if (anchor.nodeType === Node.ELEMENT_NODE) {
      const element = anchor as HTMLElement;
      const index = direction === 'backward' ? selection.anchorOffset - 1 : selection.anchorOffset;
      const sibling = element.childNodes[index];
      if (sibling instanceof HTMLElement && sibling.dataset?.chipId) {
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
    insertChipFromText(text);
  };

  const renderMessageContent = (message: Message) => {
    const { mainHtml, quotes } = extractQuotesFromHtml(renderMarkdown(message.content));
    const hasMain = mainHtml.trim().length > 0;

    return (
      <>
        {hasMain ? (
          <div
            class="ageaf-message__content"
            dangerouslySetInnerHTML={{ __html: mainHtml }}
          />
        ) : null}
        {quotes.length > 0 ? (
          <div class="ageaf-message__quote">
            <div class="ageaf-message__quote-body">
              {quotes.map((quoteHtml, index) => (
                <div
                  class="ageaf-message__quote-block"
                  key={`${message.id}-quote-${index}`}
                  dangerouslySetInnerHTML={{ __html: quoteHtml }}
                />
              ))}
            </div>
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
    const token = getKnownModelToken(model.value) ?? getKnownModelToken(model.displayName);
    if (token && token in MODEL_DISPLAY) {
      return MODEL_DISPLAY[token].label;
    }
    return model.displayName ?? DEFAULT_MODEL_LABEL;
  };

  const getRuntimeModelDescription = (model: RuntimeModel) => {
    const token = getKnownModelToken(model.value) ?? getKnownModelToken(model.displayName);
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
    return match ? getRuntimeModelLabel(match) : DEFAULT_MODEL_LABEL;
  };

  const getSelectedThinkingMode = () => {
    const match = thinkingModes.find((mode) => mode.id === currentThinkingMode);
    return match ?? thinkingModes[0] ?? FALLBACK_THINKING_MODES[0];
  };

  const persistRuntimeOptions = async (next: Partial<Options>) => {
    const current = settings ?? (await getOptions());
    const updated = { ...current, ...next };
    setSettings(updated);
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEY_OPTIONS]: updated });
  };

  const applyRuntimePreferences = async (payload: {
    model?: string | null;
    thinkingMode?: string | null;
  }) => {
    const options = settings ?? (await getOptions());
    if (!options.hostUrl) return;

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
    const conversationId = params?.conversationId ?? chatConversationIdRef.current;
    const state = chatStateRef.current;
    const conversation =
      conversationId && state ? findConversation(state, conversationId) : null;
    const provider = conversation?.provider ?? providerOverride;

    const cached = getCachedStoredUsage(conversation, provider);
    if (cached) {
      setContextUsageFromStored(cached);
    }

    const throttleMs = getContextUsageThrottleMs(provider);
    if (!params?.force && cached && Date.now() - cached.updatedAt < throttleMs) {
      return;
    }

    if (contextRefreshInFlightRef.current) return;
    const options = settings ?? (await getOptions());
    if (!options.hostUrl) return;
    contextRefreshInFlightRef.current = true;

    try {
      if (provider === 'codex') {
        const threadId = conversation?.providerState?.codex?.threadId;
        const usage = await fetchCodexRuntimeContextUsage(options, { threadId });
        if (usage.contextWindow || usage.usedTokens > 0 || usage.percentage !== null) {
          const nextUsage: StoredContextUsage = {
            usedTokens: usage.usedTokens,
            contextWindow: usage.contextWindow,
            percentage: usage.percentage,
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
            setContextUsage({
              usedTokens: nextUsage.usedTokens,
              contextWindow: nextUsage.contextWindow,
              percentage: nextUsage.percentage,
            });
          }
        }
        return;
      }

      const usage = await fetchClaudeRuntimeContextUsage(options);
      if (usage.contextWindow || usage.usedTokens > 0 || usage.percentage !== null) {
        const nextUsage: StoredContextUsage = {
          usedTokens: usage.usedTokens,
          contextWindow: usage.contextWindow,
          percentage: usage.percentage,
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
          setContextUsage({
            usedTokens: nextUsage.usedTokens,
            contextWindow: nextUsage.contextWindow,
            percentage: nextUsage.percentage,
          });
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
      const supportedEfforts: Array<{ reasoningEffort: string; description: string }> =
        selectedModel?.supportedReasoningEfforts ?? [];
      const supportedModes = new Set(
        supportedEfforts.map((entry: { reasoningEffort: string; description: string }) =>
          getThinkingModeIdForCodexEffort(String(entry.reasoningEffort ?? ''))
        )
      );
      const nextThinkingModes = FALLBACK_THINKING_MODES.map((mode) => ({
        ...mode,
        maxThinkingTokens: null,
      })).filter((mode) => supportedModes.has(mode.id));
      setThinkingModes(nextThinkingModes.length > 0 ? nextThinkingModes : FALLBACK_THINKING_MODES);
      const defaultMode = getThinkingModeIdForCodexEffort(selectedModel?.defaultReasoningEffort);
      const nextMode = supportedModes.has(currentThinkingMode) ? currentThinkingMode : defaultMode;
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
    const mode = thinkingModes.find((entry) => entry.id === modeId) ??
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
      await persistRuntimeOptions({ openaiApprovalPolicy: next ? 'never' : 'on-request' });
      return;
    }
    await persistRuntimeOptions({ claudeYoloMode: next });
  };

  const thinkingEnabled = currentThinkingMode !== 'off';

  const stopThinkingTimer = () => {
    if (thinkingTimerRef.current !== null) {
      window.clearInterval(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  };

  const startThinkingTimer = () => {
    stopThinkingTimer();
    lastThinkingSecondsRef.current = 0;
    thinkingCompleteRef.current = false;
    if (!thinkingEnabled) {
      setStreamingState('Working · ESC to interrupt', true);
      return;
    }
    setStreamingState('Thinking 0s · ESC to interrupt', true);
    thinkingTimerRef.current = window.setInterval(() => {
      if (!activityStartRef.current) return;
      const seconds = Math.max(0, Math.floor((Date.now() - activityStartRef.current) / 1000));
      if (seconds !== lastThinkingSecondsRef.current) {
        lastThinkingSecondsRef.current = seconds;
        setStreamingStatus(`Thinking ${seconds}s · ESC to interrupt`);
      }
    }, 250);
  };

  const markThinkingComplete = () => {
    if (thinkingCompleteRef.current) return;
    thinkingCompleteRef.current = true;

    if (activityStartRef.current) {
      lastThinkingSecondsRef.current = Math.max(
        0,
        Math.floor((Date.now() - activityStartRef.current) / 1000)
      );
    }

    stopThinkingTimer();
    if (!thinkingEnabled) {
      setStreamingStatus('Responding · ESC to interrupt');
      return;
    }
    setStreamingStatus(`Thought for ${lastThinkingSecondsRef.current}s · ESC to interrupt`);
  };

  const stopStreamTimer = () => {
    if (streamTimerRef.current !== null) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  };

  const maybeFinalizeStream = () => {
    if (!pendingDoneRef.current) return;
    if (streamTokensRef.current.length > 0) return;

    const pending = pendingDoneRef.current;
    pendingDoneRef.current = null;
    const finalText = streamingTextRef.current.trim();
    stopThinkingTimer();
    const duration = Math.max(0, lastThinkingSecondsRef.current);
    const statusLine = thinkingEnabled ? `Thought for ${duration}s` : undefined;
    activityStartRef.current = null;

    if (pending.status === 'ok' && finalText) {
      setMessages((prev) => [
        ...prev,
        createMessage({
          role: 'assistant',
          content: finalText,
          ...(statusLine ? { statusLine } : {}),
        }),
      ]);
    }
    if (pending.status !== 'ok') {
      const message = pending.message ?? 'Job failed';
      setMessages((prev) => [...prev, createMessage({ role: 'system', content: message })]);
    }

    setStreamingText('');
    streamingTextRef.current = '';
    streamTokensRef.current = [];
    stopStreamTimer();
    setStreamingState(null, false);

    if (chatProvider === 'claude') {
      void refreshContextUsage();
    }
    finishJob();
  };

  const startStreamTimer = () => {
    if (streamTimerRef.current !== null) return;
    streamTimerRef.current = window.setInterval(() => {
      if (streamTokensRef.current.length === 0) {
        if (pendingDoneRef.current) {
          maybeFinalizeStream();
        } else {
          stopStreamTimer();
        }
        return;
      }
      const next = streamTokensRef.current.shift();
      if (!next) return;
      streamingTextRef.current += next;
      setStreamingText(streamingTextRef.current);
    }, 30);
  };

  const enqueueStreamTokens = (text: string) => {
    const tokens = text.match(/\s+|[^\s]+/g) ?? [text];
    streamTokensRef.current.push(...tokens);
    startStreamTimer();
  };

  const setSending = (value: boolean) => {
    isSendingRef.current = value;
    setIsSending(value);
  };

  const enqueueMessage = (text: string) => {
    queueRef.current.push({ text });
    setQueueCount(queueRef.current.length);
  };

  const dequeueMessage = () => {
    const next = queueRef.current.shift();
    setQueueCount(queueRef.current.length);
    return next;
  };

  const finishJob = () => {
    abortControllerRef.current = null;
    activeJobIdRef.current = null;
    interruptedRef.current = false;
    thinkingCompleteRef.current = false;
    setToolRequests([]);
    setToolRequestInputs({});
    setToolRequestBusy(false);
    setSending(false);
    const next = dequeueMessage();
    if (next) {
      void sendMessage(next.text);
    }
  };

  function interruptInFlightJob() {
    if (interruptedRef.current) return;
    if (!isSendingRef.current && streamTimerRef.current == null) return;

    interruptedRef.current = true;
    setSending(false);
    const controller = abortControllerRef.current;
    stopThinkingTimer();
    stopStreamTimer();
    streamTokensRef.current = [];
    pendingDoneRef.current = null;
    setPatch(null);
    setToolRequests([]);
    setToolRequestInputs({});
    setToolRequestBusy(false);
    activeJobIdRef.current = null;

    const partial = streamingTextRef.current.trim();
    const content = partial
      ? `${partial}\n\n${INTERRUPTED_BY_USER_MARKER}`
      : INTERRUPTED_BY_USER_MARKER;
    setMessages((prev) => [...prev, createMessage({ role: 'assistant', content })]);

    setStreamingText('');
    streamingTextRef.current = '';
    setStreamingState(null, false);
    controller?.abort();
    abortControllerRef.current = null;
    if (!controller) {
      finishJob();
    }
  }

  const sendMessage = async (text: string) => {
    const bridge = window.ageafBridge;
    if (!bridge) return;
    const provider = chatProvider;
    scrollToBottom();
    setMessages((prev) => [...prev, createMessage({ role: 'user', content: text })]);

    setSending(true);
    setPatch(null);
    setStreamingText('');
    streamingTextRef.current = '';
    streamTokensRef.current = [];
    pendingDoneRef.current = null;
    stopStreamTimer();
    activityStartRef.current = Date.now();
    startThinkingTimer();
    interruptedRef.current = false;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const selection = await bridge.requestSelection();
      const options = await getOptions();
      const runtimeModel =
        currentModel ?? options.claudeModel ?? DEFAULT_MODEL_VALUE;
      const runtimeThinkingTokens =
        currentThinkingTokens ?? options.claudeMaxThinkingTokens ?? null;
      const conversationId = chatConversationIdRef.current;
      const state = chatStateRef.current;
      const conversation =
        conversationId && state
          ? findConversation(state, conversationId)
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
	              ? runtimeModels.find((entry) => entry.value === codexModelCandidate)
	              : null) ??
	            runtimeModels.find((entry) => entry.isDefault) ??
	            runtimeModels.find((entry) => entry.supportedReasoningEfforts !== undefined) ??
	            runtimeModels[0] ??
	            null
	          : null;
	      const codexModel =
	        provider === 'codex' && codexRuntimeModel?.supportedReasoningEfforts !== undefined
	          ? codexRuntimeModel.value
	          : null;
	      const codexEffort =
	        provider === 'codex' && codexModel
	          ? getCodexEffortForThinkingMode(
	              currentThinkingMode as ThinkingMode['id'],
	              codexRuntimeModel
	            ) ?? codexRuntimeModel?.defaultReasoningEffort ?? null
	          : null;
	      const payload =
	        provider === 'codex'
	          ? {
	              provider: 'codex' as const,
	              action: 'chat',
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
                message: text,
                selection: selection?.selection ?? '',
                surroundingBefore: selection?.before ?? '',
                surroundingAfter: selection?.after ?? '',
              },
              policy: { requireApproval: false, allowNetwork: false, maxFiles: 1 },
              userSettings: {
                displayName: options.displayName,
                customSystemPrompt: options.customSystemPrompt,
              },
            }
          : {
        provider: 'claude' as const,
        action: 'chat',
        runtime: {
          claude: {
            cliPath: options.claudeCliPath,
            envVars: options.claudeEnvVars,
            loadUserSettings: options.claudeLoadUserSettings,
                  model: runtimeModel ?? undefined,
                  maxThinkingTokens: runtimeThinkingTokens ?? undefined,
                  sessionScope: 'project' as const,
                  yoloMode,
          },
        },
        overleaf: { url: window.location.href },
        context: {
          message: text,
          selection: selection?.selection ?? '',
          surroundingBefore: selection?.before ?? '',
          surroundingAfter: selection?.after ?? '',
        },
        policy: { requireApproval: false, allowNetwork: false, maxFiles: 1 },
              userSettings: {
                displayName: options.displayName,
                customSystemPrompt: options.customSystemPrompt,
                enableTools: options.enableTools,
                enableCommandBlocklist: options.enableCommandBlocklist,
                blockedCommandsUnix: options.blockedCommandsUnix,
              },
            };

      const { jobId } = await createJob(options, payload, { signal: abortController.signal });
      activeJobIdRef.current = jobId;
      setToolRequests([]);
      setToolRequestInputs({});
      setToolRequestBusy(false);
      await streamJobEvents(options, jobId, (event) => {
        if (interruptedRef.current) return;

        if (event.event === 'delta') {
          const deltaText = event.data?.text ?? '';
          if (deltaText) {
            markThinkingComplete();
            enqueueStreamTokens(deltaText);
          }
        }

        if (event.event === 'plan') {
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
          const contextWindow = Number(event.data?.contextWindow ?? 0) || null;
          const percentage =
            contextWindow && contextWindow > 0
              ? Math.round((usedTokens / contextWindow) * 100)
              : null;
          setContextUsage({ usedTokens, contextWindow, percentage });
          if (conversationId) {
            const state = chatStateRef.current;
            if (state) {
              const nextUsage: StoredContextUsage = {
                usedTokens,
                contextWindow,
                percentage,
                updatedAt: Date.now(),
              };
              chatStateRef.current = setConversationContextUsage(
                state,
                provider,
                conversationId,
                nextUsage
              );
              scheduleChatSave();
            }
          }
          return;
        }

        if (event.event === 'patch') {
          markThinkingComplete();
          setPatch(event.data as Patch);
        }

        if (event.event === 'done') {
          markThinkingComplete();
          const status = event.data?.status ?? 'ok';
          pendingDoneRef.current = {
            status,
            message: event.data?.message,
          };
          if (provider === 'codex') {
            const threadId = event.data?.threadId;
            if (typeof threadId === 'string' && threadId) {
              const projectId = chatProjectIdRef.current;
              const conversationId = chatConversationIdRef.current;
              const state = chatStateRef.current;
              if (projectId && conversationId && state) {
                chatStateRef.current = setConversationCodexThreadId(state, conversationId, threadId);
                scheduleChatSave();
              }
            }
          }
          maybeFinalizeStream();
        }
      }, { signal: abortController.signal });
    } catch (error) {
      const isAbortError =
        interruptedRef.current &&
        error instanceof Error &&
        error.name === 'AbortError';
      if (isAbortError) {
        setStreamingState(null, false);
        activityStartRef.current = null;
        pendingDoneRef.current = null;
        streamTokensRef.current = [];
        stopStreamTimer();
        stopThinkingTimer();
            setStreamingText('');
            streamingTextRef.current = '';
        finishJob();
            return;
          }
      const message = error instanceof Error ? error.message : 'Request failed';
      setMessages((prev) => [...prev, createMessage({ role: 'system', content: message })]);
      setStreamingState(null, false);
      activityStartRef.current = null;
      pendingDoneRef.current = null;
      streamTokensRef.current = [];
      stopStreamTimer();
      stopThinkingTimer();
      setStreamingText('');
      streamingTextRef.current = '';
      finishJob();
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  const onSend = () => {
    const bridge = window.ageafBridge;
    const { text, hasContent } = serializeEditorContent();
    if (!bridge || !hasContent) return;

    clearEditor();
    scrollToBottom();
    if (isSendingRef.current) {
      enqueueMessage(text);
      return;
    }
    void sendMessage(text);
  };

  const onInputKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
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

  const onApplyPatch = () => {
    if (!patch || !window.ageafBridge) return;
    if (patch.kind === 'replaceSelection') {
      window.ageafBridge.replaceSelection(patch.text);
    } else {
      window.ageafBridge.insertAtCursor(patch.text);
    }
    setPatch(null);
  };

  const dismissToolRequest = () => {
    setToolRequests((prev) => prev.slice(1));
    setToolRequestInputs({});
    setToolRequestBusy(false);
  };

  const respondToToolRequest = async (request: ToolRequest, result: unknown) => {
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
        error instanceof Error ? error.message : 'Failed to respond to tool request';
      setMessages((prev) => [
        ...prev,
        createMessage({ role: 'system', content: message }),
      ]);
      setToolRequestBusy(false);
    }
  };

  const onSaveSettings = async () => {
    if (!settings) return;
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEY_OPTIONS]: settings });
    setSettingsMessage('Saved');
    void refreshContextUsage({ force: true });
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
    chatStateRef.current = setConversationMessages(state, chatProvider, conversationId, []);
    scheduleChatSave();
  };

  const onNewChat = (provider: ProviderId) => {
    const projectId = chatProjectIdRef.current;
    const state = chatStateRef.current;
    if (!projectId || !state) return;
    const { state: nextState, conversation } = startNewConversation(state, provider);
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
    if (chatActionsDisabled) return;
    const projectId = chatProjectIdRef.current;
    const state = chatStateRef.current;
    if (!projectId || !state) return;
    const conversation = findConversation(state, conversationId);
    if (!conversation) return;

    const provider = conversation.provider;
    chatConversationIdRef.current = conversationId;
    chatStateRef.current = setActiveConversation(state, provider, conversationId);
    setActiveSessionId(conversationId);
    setChatProvider(provider);
    setPatch(null);
    setToolRequests([]);
    setToolRequestInputs({});
    setToolRequestBusy(false);
    setStreamingState(null, false);
    setStreamingText('');
    streamingTextRef.current = '';
    streamTokensRef.current = [];
    pendingDoneRef.current = null;
    stopStreamTimer();
    stopThinkingTimer();
    setMessages(conversation.messages.map((message) => createMessage(message)));
    scrollToBottom();
    setContextUsageFromStored(getCachedStoredUsage(conversation, provider));
    void refreshContextUsage({ provider, conversationId });
    scheduleChatSave();
  };

  const onCloseSession = () => {
    if (chatActionsDisabled) return;
    const projectId = chatProjectIdRef.current;
    const state = chatStateRef.current;
    const currentId = chatConversationIdRef.current;
    if (!projectId || !state || !currentId) return;

    const currentConversation = findConversation(state, currentId);
    if (!currentConversation) return;
    const currentProvider = currentConversation.provider;
    const orderedBefore = getOrderedSessionIds(state);
    const currentIndex = Math.max(0, orderedBefore.indexOf(currentId));
    let nextState = deleteConversation(state, currentProvider, currentId);
    let orderedAfter = getOrderedSessionIds(nextState);
    let nextProvider: ProviderId = currentProvider;

    let nextActiveId: string | null = null;
    if (orderedAfter.length > 0) {
      nextActiveId = orderedAfter[Math.min(currentIndex, orderedAfter.length - 1)];
      const nextConversation = nextActiveId ? findConversation(nextState, nextActiveId) : null;
      if (nextConversation) {
        nextProvider = nextConversation.provider;
        nextState = setActiveConversation(nextState, nextProvider, nextActiveId);
      }
    } else {
      const created = startNewConversation(nextState, currentProvider);
      nextState = created.state;
      nextActiveId = created.conversation.id;
      orderedAfter = getOrderedSessionIds(nextState);
    }

    chatStateRef.current = nextState;
    chatConversationIdRef.current = nextActiveId;
    setSessionIds(orderedAfter);
    setActiveSessionId(nextActiveId);
    setChatProvider(nextProvider);

    const nextConversation = nextActiveId ? findConversation(nextState, nextActiveId) : null;
    setContextUsageFromStored(getCachedStoredUsage(nextConversation, nextProvider));
    void refreshContextUsage({ provider: nextProvider, conversationId: nextActiveId });

    setPatch(null);
    setToolRequests([]);
    setToolRequestInputs({});
    setToolRequestBusy(false);
    setStreamingState(null, false);
    setStreamingText('');
    streamingTextRef.current = '';
    streamTokensRef.current = [];
    pendingDoneRef.current = null;
    stopStreamTimer();
    stopThinkingTimer();

    setMessages(
      nextConversation ? nextConversation.messages.map((message) => createMessage(message)) : []
    );
    clearEditor();
    scrollToBottom();
    scheduleChatSave();
  };

  const chatActionsDisabled = isSending || queueCount > 0;
  const activeToolRequest = toolRequests[0] ?? null;
  const activeToolQuestions: ToolInputQuestion[] =
    activeToolRequest?.kind === 'user_input' && Array.isArray(activeToolRequest.params?.questions)
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
                const description = String((option as any).description ?? '').trim();
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
          class={`ageaf-panel__divider-toggle ${collapsed ? 'is-collapsed' : ''}`}
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
      <header class="ageaf-panel__header">
        <div class="ageaf-panel__title">
          <span class="ageaf-panel__logo">A</span>
          <div>
            <div class="ageaf-panel__name">Ageaf</div>
            <div class="ageaf-panel__tagline">
              Ask me to rewrite, explain, or fix LaTeX errors.
            </div>
          </div>
        </div>
	          <div
	            class={`ageaf-provider ${providerIndicatorClass}`}
	            aria-label={`Provider: ${providerDisplay.label}`}
	          >
	            <span class="ageaf-provider__dot" aria-hidden="true" />
	            <span class="ageaf-provider__label">{providerDisplay.label}</span>
	          </div>
      </header>
      <div class="ageaf-panel__body">
          <div class="ageaf-panel__chat" ref={chatRef}>
          {messages.map((message) => (
            <div
              class={`ageaf-message ageaf-message--${message.role}`}
              key={message.id}
            >
              {message.role === 'assistant' && message.statusLine ? (
                <div class="ageaf-message__status">{message.statusLine}</div>
              ) : null}
              {renderMessageContent(message)}
            </div>
          ))}
          {streamingStatus ? (
            <div class="ageaf-message ageaf-message--assistant">
              <div class={`ageaf-message__status ${isStreamingActive ? 'is-active' : ''}`}>
                {streamingStatus}
              </div>
              {streamingText ? (
                <div
                  class="ageaf-message__content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }}
                />
              ) : null}
            </div>
          ) : null}
          {patch ? (
            <div class="ageaf-message ageaf-message--system">
              Patch ready ({patch.kind}).
              <button class="ageaf-panel__apply" type="button" onClick={onApplyPatch}>
                Apply
              </button>
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
                        void respondToToolRequest(activeToolRequest, 'decline');
                      }}
                    >
                      Decline
                    </button>
                    <button
                      class="ageaf-panel__apply"
                      type="button"
                      disabled={toolRequestBusy}
                      onClick={() => {
                        void respondToToolRequest(activeToolRequest, 'accept');
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
                      const value = (toolRequestInputs[question.id] ?? '').trim();
                      answers[question.id] = { answers: value ? [value] : [] };
                    }
                    void respondToToolRequest(activeToolRequest, { answers });
                  }}
                >
                  <div class="ageaf-toolcall__title">Input needed</div>
                  {activeToolQuestions.map((question) => (
                    <div class="ageaf-toolcall__question" key={question.id}>
                      {question.header ? (
                        <div class="ageaf-toolcall__question-title">{question.header}</div>
                      ) : null}
                      {question.question ? (
                        <div class="ageaf-toolcall__question-text">{question.question}</div>
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
                          const value = (e.currentTarget as HTMLTextAreaElement).value;
                          setToolRequestInputs((prev) => ({ ...prev, [question.id]: value }));
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
                            activeToolQuestions.map((question) => [question.id, { answers: [] }])
                          ),
                        });
                      }}
                    >
                      Skip
                    </button>
                    <button class="ageaf-panel__apply" type="submit" disabled={toolRequestBusy}>
                      Submit
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
          </div>
          {!isAtBottom ? (
            <button class="ageaf-panel__scroll" type="button" onClick={scrollToBottom}>
              Scroll to bottom
            </button>
          ) : null}
          <div class="ageaf-runtime">
          <div class="ageaf-runtime__picker">
            <button class="ageaf-runtime__button" type="button" aria-haspopup="listbox">
              <span class="ageaf-runtime__value">{getSelectedModelLabel()}</span>
            </button>
            <div class="ageaf-runtime__menu" role="listbox">
              {getOrderedRuntimeModels().map((model) => (
                <button
                  class={`ageaf-runtime__option ${isRuntimeModelSelected(model) ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => onSelectModel(model.value)}
                  key={model.value}
                  aria-selected={isRuntimeModelSelected(model)}
                >
                  <div class="ageaf-runtime__option-title">{getRuntimeModelLabel(model)}</div>
                  <div class="ageaf-runtime__option-description">
                    {getRuntimeModelDescription(model)}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div class="ageaf-runtime__picker">
            <button class="ageaf-runtime__button" type="button" aria-haspopup="listbox">
              <span class="ageaf-runtime__label">Thinking</span>
              <span class="ageaf-runtime__value ageaf-runtime__value--accent">
                {selectedThinkingMode.label}
              </span>
            </button>
            <div class="ageaf-runtime__menu" role="listbox">
              {thinkingModes.map((mode) => (
                <button
                  class={`ageaf-runtime__option ${mode.id === currentThinkingMode ? 'is-selected' : ''}`}
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
	            <span class="ageaf-runtime__yolo-text">{yoloMode ? 'YOLO' : 'Safe'}</span>
	            <span class="ageaf-runtime__yolo-switch" aria-hidden="true">
	              <span class="ageaf-runtime__yolo-thumb" />
	            </span>
	          </button>
        </div>
      </div>
      <div class="ageaf-panel__input">
	        <div class="ageaf-panel__toolbar">
            <div class="ageaf-session-tabs" role="tablist" aria-label="Sessions">
              {sessionIds.map((id, index) => {
                const state = chatStateRef.current;
                const conversation = state ? findConversation(state, id) : null;
                const providerLabel = conversation?.provider === 'codex' ? 'OpenAI' : 'Anthropic';
                return (
        <button
                    class={`ageaf-session-tab ${id === activeSessionId ? 'is-active' : ''}`}
                    type="button"
                    role="tab"
                    aria-selected={id === activeSessionId}
                    aria-label={`Session ${index + 1} (${providerLabel})`}
                    data-tooltip={providerLabel}
                    onClick={() => onSelectSession(id)}
                    key={id}
                    disabled={chatActionsDisabled}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div class="ageaf-toolbar-actions">
              <div class="ageaf-toolbar-menu" data-disabled={chatActionsDisabled ? 'true' : 'false'}>
                <button
                  class="ageaf-toolbar-button"
                  type="button"
                  aria-haspopup="menu"
                  aria-label="New chat"
                  data-tooltip="New chat"
                  disabled={chatActionsDisabled}
                >
                  ＋
                </button>
                <div class="ageaf-toolbar-menu__list" role="menu" aria-label="Select provider">
                  <button
                    class="ageaf-toolbar-menu__option"
                    type="button"
                    onClick={() => onNewChat('claude')}
                    role="menuitem"
                  >
                    Anthropic
                  </button>
                  <button
                    class="ageaf-toolbar-menu__option"
                    type="button"
                    onClick={() => onNewChat('codex')}
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
                disabled={chatActionsDisabled}
              >
                ⌫
              </button>
              <button
                class="ageaf-toolbar-button"
                type="button"
                onClick={onCloseSession}
                aria-label="Close session"
                data-tooltip="Close session"
                disabled={chatActionsDisabled}
              >
                ×
              </button>
          <button
                class="ageaf-panel__settings ageaf-toolbar-button"
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
                data-tooltip="Settings"
        >
          ⚙
        </button>
            </div>
          </div>
        <div
          class={`ageaf-panel__editor ${editorEmpty ? 'is-empty' : ''}`}
          contentEditable="true"
          role="textbox"
          aria-multiline="true"
          aria-label="Message input"
          data-placeholder="Tell Ageaf what to do…"
          ref={editorRef}
          onInput={() => syncEditorEmpty()}
          onPaste={(event) => handlePaste(event as ClipboardEvent)}
          onKeyDown={(event) => onInputKeyDown(event as KeyboardEvent)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
        />
        {isSending || queueCount > 0 ? (
          <div class="ageaf-panel__queue">
            {isSending ? 'Sending…' : 'Queued'}
            {queueCount > 0 ? ` (${queueCount})` : ''}
          </div>
        ) : null}
      </div>
      </div>
      {settingsOpen ? (
        <div class="ageaf-settings">
          <div
            class="ageaf-settings__backdrop"
            onClick={() => setSettingsOpen(false)}
          />
          <div class="ageaf-settings__panel" role="dialog" aria-label="Settings">
            <div class="ageaf-settings__sidebar">
              <button
                class={`ageaf-settings__tab ${settingsTab === 'connection' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setSettingsTab('connection')}
              >
                Connection
              </button>
              <button
                class={`ageaf-settings__tab ${settingsTab === 'authentication' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setSettingsTab('authentication')}
              >
                Authentication
              </button>
              <button
                class={`ageaf-settings__tab ${settingsTab === 'customization' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setSettingsTab('customization')}
              >
                Customization
              </button>
              <button
                class={`ageaf-settings__tab ${settingsTab === 'tools' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setSettingsTab('tools')}
              >
                Tools
              </button>
              <button
                class={`ageaf-settings__tab ${settingsTab === 'safety' ? 'is-active' : ''}`}
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
                      <label class="ageaf-settings__label" for="ageaf-host-url">
                        Host URL
                      </label>
                      <input
                        id="ageaf-host-url"
                        class="ageaf-settings__input"
                        type="text"
                        value={settings.hostUrl ?? ''}
                        onInput={(event) =>
                          updateSettings({ hostUrl: (event.target as HTMLInputElement).value })
                        }
                        placeholder="http://127.0.0.1:3210"
                      />
                    </div>
                  ) : null}
                  {settingsTab === 'authentication' ? (
                    <div class="ageaf-settings__section">
                      <h3>Authentication</h3>
	                      <h4 class="ageaf-settings__subhead">Anthropic</h4>
                      <p class="ageaf-settings__hint">
	                        If you already logged into Claude Code in your terminal, you can leave the API key blank.
	                        Otherwise set it via environment variables below.
                      </p>
                      <label class="ageaf-settings__label" for="ageaf-claude-cli">
                        Claude CLI path (optional)
                      </label>
                      <input
                        id="ageaf-claude-cli"
                        class="ageaf-settings__input"
                        type="text"
                        value={settings.claudeCliPath ?? ''}
                        onInput={(event) =>
                          updateSettings({ claudeCliPath: (event.target as HTMLInputElement).value })
                        }
                        placeholder="Leave empty to auto-detect"
                      />
                      <label class="ageaf-settings__label" for="ageaf-claude-env">
                        Environment variables (KEY=VALUE)
                      </label>
                      <p class="ageaf-settings__hint">
                        Optional: you can also set ANTHROPIC_BASE_URL and ANTHROPIC_MODEL here, in addition to
                        ANTHROPIC_API_KEY.
                      </p>
                      <textarea
                        id="ageaf-claude-env"
                        class="ageaf-settings__textarea"
                        rows={6}
                        value={settings.claudeEnvVars ?? ''}
                        onInput={(event) =>
                          updateSettings({ claudeEnvVars: (event.target as HTMLTextAreaElement).value })
                        }
	                        placeholder={'ANTHROPIC_API_KEY=your-key\nANTHROPIC_BASE_URL=https://api.anthropic.com\nANTHROPIC_MODEL=claude-sonnet-4-5'}
                      />
                      <label class="ageaf-settings__checkbox">
                        <input
                          type="checkbox"
                          checked={settings.claudeLoadUserSettings ?? false}
                          onChange={(event) =>
                            updateSettings({ claudeLoadUserSettings: event.currentTarget.checked })
                          }
                        />
                        Load ~/.claude/settings.json (user permissions)
                      </label>
	                      <h4 class="ageaf-settings__subhead">OpenAI</h4>
	                      <p class="ageaf-settings__hint">
	                        If you already logged into the Codex CLI in your terminal, you can leave the API key blank.
	                        Otherwise set it via environment variables below.
	                      </p>
	                      <label class="ageaf-settings__label" for="ageaf-codex-cli">
	                        Codex CLI path (optional)
	                      </label>
	                      <input
	                        id="ageaf-codex-cli"
	                        class="ageaf-settings__input"
	                        type="text"
	                        value={settings.openaiCodexCliPath ?? ''}
	                        onInput={(event) =>
	                          updateSettings({ openaiCodexCliPath: (event.target as HTMLInputElement).value })
	                        }
	                        placeholder="Leave empty to auto-detect"
	                      />
	                      <label class="ageaf-settings__label" for="ageaf-openai-env">
	                        Environment variables (KEY=VALUE)
	                      </label>
	                      <p class="ageaf-settings__hint">
	                        Optional: you can set OPENAI_BASE_URL (proxy) here in addition to OPENAI_API_KEY.
	                      </p>
	                      <textarea
	                        id="ageaf-openai-env"
	                        class="ageaf-settings__textarea"
	                        rows={6}
	                        value={settings.openaiEnvVars ?? ''}
	                        onInput={(event) =>
	                          updateSettings({ openaiEnvVars: (event.target as HTMLTextAreaElement).value })
	                        }
	                        placeholder={'OPENAI_API_KEY=your-key\nOPENAI_BASE_URL=https://api.openai.com'}
	                      />
                    </div>
                  ) : null}
                  {settingsTab === 'customization' ? (
                    <div class="ageaf-settings__section">
                      <h3>Customization</h3>
                      <label class="ageaf-settings__label" for="ageaf-display-name">
                        What should Ageaf call you?
                      </label>
                        <input
                        id="ageaf-display-name"
                        class="ageaf-settings__input"
                        type="text"
                        value={settings.displayName ?? ''}
                        onInput={(event) =>
                          updateSettings({ displayName: (event.target as HTMLInputElement).value })
                        }
                        placeholder="Leave blank for generic greetings"
                      />
                      <p class="ageaf-settings__hint">
                        Used for personalized greetings. Leave blank for generic greetings.
                      </p>
                      <label class="ageaf-settings__label" for="ageaf-custom-prompt">
                        Custom system prompt
                      </label>
                      <textarea
                        id="ageaf-custom-prompt"
                        class="ageaf-settings__textarea"
                        rows={8}
                        value={settings.customSystemPrompt ?? ''}
                        onInput={(event) =>
                          updateSettings({ customSystemPrompt: (event.target as HTMLTextAreaElement).value })
                        }
                        placeholder="Additional instructions appended to the default system prompt..."
                      />
                      <p class="ageaf-settings__hint">
                        Additional instructions appended to the default system prompt.
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
                                setSettingsMessage(next ? 'Host tools enabled' : 'Host tools disabled');
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
                        When enabled, Ageaf may request to run local commands (Bash) or read files via the host runtime.
                        This toggle updates both the extension and the host setting.
                      </p>
                      <p class="ageaf-settings__hint">
                        Host status:{' '}
                        {hostToolsStatus
                          ? `tools=${hostToolsStatus.toolsEnabled ? 'on' : 'off'}, remote-toggle=${
                              hostToolsStatus.remoteToggleAllowed ? 'allowed' : 'blocked'
                            }, available=${hostToolsStatus.toolsAvailable ? 'yes' : 'no'}`
                          : 'unavailable'}
                      </p>
                      {!hostToolsStatus?.remoteToggleAllowed ? (
                        <p class="ageaf-settings__hint">
                          To allow the extension to control host tools, restart the host with
                          {' '}AGEAF_ALLOW_REMOTE_TOOL_TOGGLE=true.
                        </p>
                      ) : null}
                      {!hostToolsStatus?.toolsAvailable ? (
                        <p class="ageaf-settings__hint">
                          Tools are not available. Restart the host with AGEAF_ENABLE_TOOLS=true to permit tool execution.
                        </p>
                      ) : null}
                      <p class="ageaf-settings__hint">
                        Tip: keep this off unless you explicitly need tool use. You can still chat normally with tools disabled.
                      </p>
                      <h4 class="ageaf-settings__subhead">OpenAI</h4>
                      <label class="ageaf-settings__label" for="ageaf-openai-approval-policy">
                        Approval policy
                      </label>
                      <select
                        id="ageaf-openai-approval-policy"
                        class="ageaf-settings__input"
                        value={settings.openaiApprovalPolicy ?? 'never'}
                        onChange={(event) =>
                          updateSettings({
                            openaiApprovalPolicy: (event.currentTarget as HTMLSelectElement)
                              .value as Options['openaiApprovalPolicy'],
                          })
                        }
                      >
                        <option value="untrusted">untrusted</option>
                        <option value="on-request">on-request</option>
                        <option value="on-failure">on-failure</option>
                        <option value="never">never</option>
                      </select>
                      <p class="ageaf-settings__hint">
                        Controls Codex CLI command approvals (approvalPolicy). Use "never" only if you trust the agent to run commands without prompting.
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
                            updateSettings({ enableCommandBlocklist: event.currentTarget.checked })
                          }
                        />
                        Enable command blocklist
                      </label>
                      <p class="ageaf-settings__hint">
                        Blocks potentially dangerous bash commands before execution.
                      </p>
                      <label class="ageaf-settings__label" for="ageaf-blocked-commands">
                        Blocked commands (Unix)
                      </label>
                      <textarea
                        id="ageaf-blocked-commands"
                        class="ageaf-settings__textarea"
                        rows={6}
                        value={settings.blockedCommandsUnix ?? ''}
                        onInput={(event) =>
                          updateSettings({ blockedCommandsUnix: (event.target as HTMLTextAreaElement).value })
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
    </aside>
  );
};
