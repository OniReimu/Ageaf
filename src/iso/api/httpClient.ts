import type { Options } from '../../types';

import { streamEvents, JobEvent } from './sse';

export type JobPayload = {
  provider: 'claude' | 'codex';
  action: string;
  runtime?: {
    claude?: {
      cliPath?: string;
      envVars?: string;
      loadUserSettings?: boolean;
      model?: string;
      maxThinkingTokens?: number | null;
      sessionScope?: 'project' | 'home';
      yoloMode?: boolean;
    };
    codex?: {
      cliPath?: string;
      envVars?: string;
      approvalPolicy?: 'untrusted' | 'on-request' | 'on-failure' | 'never';
      model?: string;
      reasoningEffort?: string;
      threadId?: string;
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
  };
  policy?: {
    requireApproval?: boolean;
    allowNetwork?: boolean;
    maxFiles?: number;
  };
  userSettings?: {
    displayName?: string;
    customSystemPrompt?: string;
    enableTools?: boolean;
    enableCommandBlocklist?: boolean;
    blockedCommandsUnix?: string;
    autoCompactEnabled?: boolean;
  };
  compaction?: {
    requestCompaction: boolean;
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
      body: JSON.stringify({
        cliPath: options.openaiCodexCliPath,
        envVars: options.openaiEnvVars,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Runtime metadata request failed (${response.status})`);
  }

  return response.json() as Promise<CodexRuntimeMetadata>;
}

export type HostToolsStatus = {
  toolsEnabled: boolean;
  toolsAvailable: boolean;
  remoteToggleAllowed: boolean;
};

export async function fetchHostToolsStatus(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(new URL('/v1/host/tools', options.hostUrl).toString());
  if (!response.ok) {
    throw new Error(`Host tools status request failed (${response.status})`);
  }
  return response.json() as Promise<HostToolsStatus>;
}

export async function setHostToolsEnabled(options: Options, enabled: boolean) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(new URL('/v1/host/tools', options.hostUrl).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Host tools update failed (${response.status})${text ? `: ${text}` : ''}`
    );
  }
  return response.json() as Promise<{ toolsEnabled: boolean }>;
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
        cliPath: options.openaiCodexCliPath,
        envVars: options.openaiEnvVars,
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
};
