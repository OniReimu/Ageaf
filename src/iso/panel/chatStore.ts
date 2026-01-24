export type ProviderId = 'claude' | 'codex';

export type StoredMessage = {
  role: 'system' | 'assistant' | 'user';
  content: string;
  statusLine?: string;
};

export type StoredContextUsage = {
  usedTokens: number;
  contextWindow: number | null;
  percentage: number | null;
  updatedAt: number;
};

export type StoredConversation = {
  id: string;
  provider: ProviderId;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  providerState?: {
    codex?: {
      threadId?: string;
      lastUsage?: StoredContextUsage;
    };
    claude?: {
      lastUsage?: StoredContextUsage;
    };
  };
};

export type StoredProviderState = {
  activeConversationId: string | null;
  conversations: StoredConversation[];
};

export type StoredProjectChat = {
  version: 1;
  activeProvider: ProviderId;
  providers: Record<ProviderId, StoredProviderState>;
};

const STORAGE_KEY_PREFIX = 'ageaf-chat-v1:project:';
const MAX_CONVERSATIONS_PER_PROVIDER = 8;
const MAX_MESSAGES_PER_CONVERSATION = 200;

export function getOverleafProjectIdFromPathname(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'project') return null;
  const projectId = segments[1];
  if (!projectId) return null;
  return projectId;
}

export function getProjectChatStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

export function createEmptyProjectChat(): StoredProjectChat {
  return {
    version: 1,
    activeProvider: 'claude',
    providers: {
      claude: { activeConversationId: null, conversations: [] },
      codex: { activeConversationId: null, conversations: [] },
    },
  };
}

function createConversationId() {
  return `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createConversation(provider: ProviderId): StoredConversation {
  const now = Date.now();
  return {
    id: createConversationId(),
    provider,
    createdAt: now,
    updatedAt: now,
    messages: [],
    ...(provider === 'codex'
      ? { providerState: { codex: {} } }
      : { providerState: { claude: {} } }),
  };
}

function coerceProvider(value: any): ProviderId | null {
  if (value === 'claude' || value === 'codex') return value;
  return null;
}

function normalizeStoredMessage(raw: any): StoredMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const role = raw.role;
  if (role !== 'system' && role !== 'assistant' && role !== 'user') return null;
  const content = typeof raw.content === 'string' ? raw.content : null;
  if (content == null) return null;
  const statusLine = typeof raw.statusLine === 'string' ? raw.statusLine : undefined;
  return { role, content, statusLine };
}

function normalizeStoredContextUsage(raw: any): StoredContextUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const usedTokens = Number(raw.usedTokens ?? raw.used_tokens ?? NaN);
  if (!Number.isFinite(usedTokens) || usedTokens < 0) return null;

  const contextWindowRaw = raw.contextWindow ?? raw.context_window ?? null;
  const contextWindowCandidate =
    contextWindowRaw === null ? null : Number(contextWindowRaw);
  const contextWindow =
    contextWindowCandidate === null
      ? null
      : Number.isFinite(contextWindowCandidate) && contextWindowCandidate > 0
        ? contextWindowCandidate
        : null;

  const percentageRaw = raw.percentage ?? raw.percent ?? null;
  const percentageCandidate = percentageRaw === null ? null : Number(percentageRaw);
  const percentage =
    percentageCandidate === null
      ? null
      : Number.isFinite(percentageCandidate)
        ? percentageCandidate
        : null;

  const updatedAt = Number(raw.updatedAt ?? raw.updated_at ?? 0);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;

  return {
    usedTokens,
    contextWindow,
    percentage,
    updatedAt,
  };
}

function normalizeConversation(raw: any, provider: ProviderId): StoredConversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) return null;
  const createdAt = Number(raw.createdAt ?? 0);
  const updatedAt = Number(raw.updatedAt ?? createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
  const messagesRaw = Array.isArray(raw.messages) ? raw.messages : [];
  const messages = messagesRaw
    .map((entry: any) => normalizeStoredMessage(entry))
    .filter((entry: StoredMessage | null): entry is StoredMessage => Boolean(entry));
  const providerStateRaw = raw.providerState ?? raw.provider_state ?? null;
  const codexUsage =
    provider === 'codex'
      ? normalizeStoredContextUsage(
          providerStateRaw?.codex?.lastUsage ?? providerStateRaw?.codex?.last_usage
        )
      : null;
  const claudeUsage =
    provider === 'claude'
      ? normalizeStoredContextUsage(
          providerStateRaw?.claude?.lastUsage ?? providerStateRaw?.claude?.last_usage
        )
      : null;
  const threadId =
    provider === 'codex'
      ? typeof providerStateRaw?.codex?.threadId === 'string'
        ? providerStateRaw.codex.threadId
        : typeof providerStateRaw?.codex?.thread_id === 'string'
          ? providerStateRaw.codex.thread_id
          : typeof raw.threadId === 'string'
            ? raw.threadId
            : undefined
      : undefined;

  const providerState: StoredConversation['providerState'] = {};
  if (provider === 'codex' && (threadId || codexUsage)) {
    providerState.codex = {
      ...(threadId ? { threadId } : {}),
      ...(codexUsage ? { lastUsage: codexUsage } : {}),
    };
  }
  if (provider === 'claude' && claudeUsage) {
    providerState.claude = { lastUsage: claudeUsage };
  }
  return {
    id,
    provider,
    createdAt,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : createdAt,
    messages,
    ...(Object.keys(providerState).length > 0 ? { providerState } : {}),
  };
}

function normalizeProviderState(raw: any, provider: ProviderId): StoredProviderState {
  const activeConversationId =
    typeof raw?.activeConversationId === 'string' ? raw.activeConversationId : null;
  const conversationsRaw = Array.isArray(raw?.conversations) ? raw.conversations : [];
  const conversations = conversationsRaw
    .map((entry: any) => normalizeConversation(entry, provider))
    .filter((entry: StoredConversation | null): entry is StoredConversation => Boolean(entry))
    .slice(0, MAX_CONVERSATIONS_PER_PROVIDER);
  return { activeConversationId, conversations };
}

export function normalizeProjectChat(raw: any): StoredProjectChat | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version !== 1) return null;
  const activeProvider = coerceProvider(raw.activeProvider) ?? 'claude';
  const providersRaw = raw.providers ?? {};

  const claude = normalizeProviderState(providersRaw.claude, 'claude');
  const codex = normalizeProviderState(providersRaw.codex, 'codex');

  return {
    version: 1,
    activeProvider,
    providers: { claude, codex },
  };
}

export function ensureActiveConversation(
  state: StoredProjectChat,
  provider: ProviderId
): { state: StoredProjectChat; conversation: StoredConversation } {
  const providerState = state.providers[provider] ?? { activeConversationId: null, conversations: [] };
  const activeId = providerState.activeConversationId;
  const existing = activeId
    ? providerState.conversations.find((conv) => conv.id === activeId)
    : null;
  if (existing) {
    const nextState =
      state.activeProvider === provider
        ? state
        : {
            ...state,
            activeProvider: provider,
          };
    return { state: nextState, conversation: existing };
  }

  const conversation = createConversation(provider);
  const nextProviderState: StoredProviderState = {
    activeConversationId: conversation.id,
    conversations: [conversation, ...providerState.conversations].slice(0, MAX_CONVERSATIONS_PER_PROVIDER),
  };

  return {
    state: {
      ...state,
      activeProvider: provider,
      providers: {
        ...state.providers,
        [provider]: nextProviderState,
      } as Record<ProviderId, StoredProviderState>,
    },
    conversation,
  };
}

export function startNewConversation(
  state: StoredProjectChat,
  provider: ProviderId
): { state: StoredProjectChat; conversation: StoredConversation } {
  const providerState = state.providers[provider] ?? { activeConversationId: null, conversations: [] };
  const conversation = createConversation(provider);
  const nextProviderState: StoredProviderState = {
    activeConversationId: conversation.id,
    conversations: [conversation, ...providerState.conversations].slice(0, MAX_CONVERSATIONS_PER_PROVIDER),
  };
  return {
    state: {
      ...state,
      activeProvider: provider,
      providers: {
        ...state.providers,
        [provider]: nextProviderState,
      } as Record<ProviderId, StoredProviderState>,
    },
    conversation,
  };
}

export function setActiveConversation(
  state: StoredProjectChat,
  provider: ProviderId,
  conversationId: string
): StoredProjectChat {
  const providerState = state.providers[provider];
  if (!providerState.conversations.some((conversation) => conversation.id === conversationId)) {
    return state;
  }

  return {
    ...state,
    activeProvider: provider,
    providers: {
      ...state.providers,
      [provider]: {
        ...providerState,
        activeConversationId: conversationId,
      },
    } as Record<ProviderId, StoredProviderState>,
  };
}

export function deleteConversation(
  state: StoredProjectChat,
  provider: ProviderId,
  conversationId: string
): StoredProjectChat {
  const providerState = state.providers[provider];
  const nextConversations = providerState.conversations.filter(
    (conversation) => conversation.id !== conversationId
  );

  let nextActiveId = providerState.activeConversationId;
  if (nextActiveId === conversationId) {
    nextActiveId = nextConversations[0]?.id ?? null;
  }

  return {
    ...state,
    activeProvider: provider,
    providers: {
      ...state.providers,
      [provider]: {
        ...providerState,
        activeConversationId: nextActiveId,
        conversations: nextConversations,
      },
    } as Record<ProviderId, StoredProviderState>,
  };
}

export function setConversationMessages(
  state: StoredProjectChat,
  provider: ProviderId,
  conversationId: string,
  messages: StoredMessage[]
): StoredProjectChat {
  const providerState = state.providers[provider];
  const trimmed = messages.slice(Math.max(0, messages.length - MAX_MESSAGES_PER_CONVERSATION));
  const now = Date.now();
  const nextConversations = providerState.conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    return {
      ...conversation,
      messages: trimmed,
      updatedAt: now,
    };
  });

  return {
    ...state,
    providers: {
      ...state.providers,
      [provider]: {
        ...providerState,
        conversations: nextConversations,
      },
    } as Record<ProviderId, StoredProviderState>,
  };
}

export function setConversationCodexThreadId(
  state: StoredProjectChat,
  conversationId: string,
  threadId: string
): StoredProjectChat {
  const provider: ProviderId = 'codex';
  const providerState = state.providers[provider];
  const now = Date.now();
  const nextConversations = providerState.conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    return {
      ...conversation,
      updatedAt: now,
      providerState: {
        ...(conversation.providerState ?? {}),
        codex: {
          ...(conversation.providerState?.codex ?? {}),
          threadId,
        },
      },
    };
  });

  return {
    ...state,
    providers: {
      ...state.providers,
      [provider]: {
        ...providerState,
        conversations: nextConversations,
      },
    } as Record<ProviderId, StoredProviderState>,
  };
}

export function setConversationContextUsage(
  state: StoredProjectChat,
  provider: ProviderId,
  conversationId: string,
  usage: StoredContextUsage
): StoredProjectChat {
  const providerState = state.providers[provider];
  const now = Date.now();
  const nextConversations = providerState.conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    const nextProviderState = {
      ...(conversation.providerState ?? {}),
      [provider]: {
        ...((conversation.providerState as any)?.[provider] ?? {}),
        lastUsage: usage,
      },
    } as StoredConversation['providerState'];
    return {
      ...conversation,
      updatedAt: now,
      providerState: nextProviderState,
    };
  });

  return {
    ...state,
    providers: {
      ...state.providers,
      [provider]: {
        ...providerState,
        conversations: nextConversations,
      },
    } as Record<ProviderId, StoredProviderState>,
  };
}

export async function loadProjectChat(projectId: string): Promise<StoredProjectChat> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return createEmptyProjectChat();
  }
  try {
    const key = getProjectChatStorageKey(projectId);
    const data = await chrome.storage.local.get([key]);
    const normalized = normalizeProjectChat(data[key]);
    return normalized ?? createEmptyProjectChat();
  } catch (error) {
    // Extension context invalidated - return empty chat
    if (error instanceof Error && error.message.includes('Extension context invalidated')) {
      return createEmptyProjectChat();
    }
    throw error;
  }
}

export async function saveProjectChat(projectId: string, state: StoredProjectChat): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const key = getProjectChatStorageKey(projectId);
    await chrome.storage.local.set({ [key]: state });
  } catch (error) {
    // Extension context invalidated - ignore silently
    if (error instanceof Error && error.message.includes('Extension context invalidated')) {
      return;
    }
    throw error;
  }
}
