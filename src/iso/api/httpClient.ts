import type { Options } from '../../types';

import { streamEvents, JobEvent } from './sse';

export type JobPayload = {
  provider: 'claude' | 'codex' | 'pi';
  action: string;
  runtime?: {
    claude?: {
      model?: string;
      maxThinkingTokens?: number | null;
      sessionScope?: 'project' | 'home';
      yoloMode?: boolean;
      conversationId?: string;
    };
    codex?: {
      approvalPolicy?: 'untrusted' | 'on-request' | 'on-failure' | 'never';
      model?: string;
      reasoningEffort?: string;
      threadId?: string;
    };
    pi?: {
      provider?: string;
      model?: string;
      thinkingLevel?: string;
      conversationId?: string;
    };
  };
  overleaf?: {
    url?: string;
    projectId?: string;
    doc?: string;
  };
  context?: {
    selection?: string;
    surroundingBefore?: string;
    surroundingAfter?: string;
    compileLog?: string;
    message?: string;
    images?: Array<{
      id: string;
      name: string;
      mediaType: string;
      data: string;
      size: number;
    }>;
    attachments?: Array<{
      id?: string;
      path?: string;
      name?: string;
      ext?: string;
      sizeBytes?: number;
      lineCount?: number;
      content?: string;
    }>;
  };
  policy?: {
    requireApproval?: boolean;
    allowNetwork?: boolean;
    maxFiles?: number;
  };
  userSettings?: {
    displayName?: string;
    customSystemPrompt?: string;
    enableCommandBlocklist?: boolean;
    blockedCommandsUnix?: string;
  };
};

export async function createJob(
  options: Options,
  payload: JobPayload,
  request?: { signal?: AbortSignal }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(new URL('/v1/jobs', options.hostUrl).toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: request?.signal,
  });

  if (!response.ok) {
    throw new Error(`Job request failed (${response.status})`);
  }

  return response.json() as Promise<{ jobId: string }>;
}

export async function streamJobEvents(
  options: Options,
  jobId: string,
  onEvent: (event: JobEvent) => void,
  request?: { signal?: AbortSignal }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const url = new URL(`/v1/jobs/${jobId}/events`, options.hostUrl).toString();
  await streamEvents(url, onEvent, { signal: request?.signal });
}

export async function respondToJobRequest(
  options: Options,
  jobId: string,
  payload: { requestId: number | string; result: unknown },
  request?: { signal?: AbortSignal }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL(`/v1/jobs/${jobId}/respond`, options.hostUrl).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: request?.signal,
    }
  );

  if (!response.ok) {
    throw new Error(`Job respond failed (${response.status})`);
  }

  return response.json().catch(() => ({}));
}

export type ClaudeRuntimeMetadata = {
  models: Array<{ value: string; displayName: string; description: string }>;
  currentModel: string | null;
  modelSource?: string;
  thinkingModes: Array<{ id: string; label: string; maxThinkingTokens: number | null }>;
  currentThinkingMode: string;
  maxThinkingTokens: number | null;
};

export async function fetchClaudeRuntimeMetadata(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/claude/metadata', options.hostUrl).toString()
  );

  if (!response.ok) {
    throw new Error(`Runtime metadata request failed (${response.status})`);
  }

  return response.json() as Promise<ClaudeRuntimeMetadata>;
}

export type CodexRuntimeMetadata = {
  models: Array<{
    value: string;
    displayName: string;
    description: string;
    supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
    defaultReasoningEffort: string;
    isDefault: boolean;
  }>;
  currentModel: string | null;
  currentReasoningEffort: string | null;
};

export async function fetchCodexRuntimeMetadata(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/codex/metadata', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    throw new Error(`Runtime metadata request failed (${response.status})`);
  }

  return response.json() as Promise<CodexRuntimeMetadata>;
}

export type AttachmentMeta = {
  id: string;
  path?: string;
  name: string;
  ext: string;
  sizeBytes: number;
  lineCount: number;
  mime: string;
  content?: string;
};

export async function openAttachmentDialog(
  options: Options,
  payload: { multiple?: boolean; extensions?: string[] }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(
    new URL('/v1/attachments/open', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    throw new Error(`Attachment dialog request failed (${response.status})`);
  }
  return response.json() as Promise<{ paths: string[] }>;
}

export async function validateAttachmentEntries(
  options: Options,
  payload: {
    entries?: Array<{
      id?: string;
      path?: string;
      name?: string;
      ext?: string;
      content?: string;
      sizeBytes?: number;
      lineCount?: number;
    }>;
    paths?: string[];
    limits?: { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number };
  }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(
    new URL('/v1/attachments/validate', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    throw new Error(`Attachment validation failed (${response.status})`);
  }
  return response.json() as Promise<{
    attachments: AttachmentMeta[];
    errors: Array<{ id?: string; path?: string; message: string }>;
  }>;
}

export type DocumentAttachmentMeta = {
  id: string;
  name: string;
  mediaType: string;
  size: number;
};

export async function validateDocumentEntries(
  options: Options,
  payload: {
    entries: Array<{
      id?: string;
      name: string;
      mediaType: string;
      data?: string;
      path?: string;
      size: number;
    }>;
    limits?: { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number };
  }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(
    new URL('/v1/attachments/validate-documents', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    throw new Error(`Document validation failed (${response.status})`);
  }
  return response.json() as Promise<{
    documents: DocumentAttachmentMeta[];
    errors: Array<{ id?: string; path?: string; message: string }>;
  }>;
}

export async function updateClaudeRuntimePreferences(
  options: Options,
  payload: { model?: string | null; thinkingMode?: string | null }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/claude/preferences', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(`Runtime preferences request failed (${response.status})`);
  }

  return response.json() as Promise<{
    currentModel: string | null;
    modelSource?: string;
    currentThinkingMode: string;
    maxThinkingTokens: number | null;
  }>;
}

export type ClaudeContextUsageResponse = {
  configured: boolean;
  model: string | null;
  usedTokens: number;
  contextWindow: number | null;
  percentage: number | null;
};

export async function fetchClaudeRuntimeContextUsage(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const url = new URL('/v1/runtime/claude/context', options.hostUrl);
  url.searchParams.set('sessionScope', 'project');
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Runtime context request failed (${response.status})`);
  }

  return response.json() as Promise<ClaudeContextUsageResponse>;
}

export type CodexContextUsageResponse = {
  configured: boolean;
  model: string | null;
  usedTokens: number;
  contextWindow: number | null;
  percentage: number | null;
};

export async function fetchCodexRuntimeContextUsage(
  options: Options,
  payload?: { threadId?: string }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/codex/context', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        threadId: payload?.threadId,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Runtime context request failed (${response.status})`);
  }

  return response.json() as Promise<CodexContextUsageResponse>;
}

export async function fetchHostHealth(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(new URL('/v1/health', options.hostUrl).toString());
  if (!response.ok) {
    throw new Error(`Host health request failed (${response.status})`);
  }
  return response.json() as Promise<HostHealthResponse>;
}

export type HostHealthResponse = {
  status: string;
  // Present on current host implementation; optional for forwards/backwards compatibility.
  claude?: {
    configured?: boolean;
  };
  pi?: {
    configured?: boolean;
  };
};

export type PiRuntimeMetadata = {
  models: Array<{
    value: string;
    displayName: string;
    provider: string;
    reasoning: boolean;
    contextWindow: number;
  }>;
  currentModel: string | null;
  currentProvider: string | null;
  availableProviders: Array<{ provider: string; hasApiKey: boolean }>;
  thinkingLevels: Array<{ id: string; label: string }>;
  currentThinkingLevel: string;
};

export async function fetchPiRuntimeMetadata(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/pi/metadata', options.hostUrl).toString()
  );

  if (!response.ok) {
    throw new Error(`Pi runtime metadata request failed (${response.status})`);
  }

  return response.json() as Promise<PiRuntimeMetadata>;
}

export async function updatePiRuntimePreferences(
  options: Options,
  payload: { provider?: string | null; model?: string | null; thinkingLevel?: string | null }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/pi/preferences', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(`Pi runtime preferences request failed (${response.status})`);
  }

  return response.json() as Promise<{
    currentProvider: string | null;
    currentModel: string | null;
    currentThinkingLevel: string;
    thinkingLevels?: Array<{ id: string; label: string }>;
  }>;
}

export type PiContextUsageResponse = {
  configured: boolean;
  model: string | null;
  usedTokens: number;
  contextWindow: number | null;
  percentage: number | null;
};

export async function fetchPiRuntimeContextUsage(
  options: Options,
  conversationId?: string
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const url = new URL('/v1/runtime/pi/context', options.hostUrl);
  if (conversationId) {
    url.searchParams.set('conversationId', conversationId);
  }
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Pi runtime context request failed (${response.status})`);
  }

  return response.json() as Promise<PiContextUsageResponse>;
}

export async function deleteSession(
  options: Options,
  provider: 'claude' | 'codex' | 'pi',
  sessionId: string
): Promise<void> {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const url = new URL(`/v1/sessions/${provider}/${sessionId}`, options.hostUrl).toString();
  const response = await fetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Session deletion failed (${response.status})${text ? `: ${text}` : ''}`);
  }
}
