import type { Options } from '../../types';
import { httpTransport } from './httpTransport';
import { nativeTransport } from './nativeTransport';
import type {
  ClaudeContextUsageResponse,
  ClaudeRuntimeMetadata,
  CodexContextUsageResponse,
  CodexRuntimeMetadata,
  HostHealthResponse,
  HostToolsStatus,
  JobPayload,
} from '../api/httpClient';
import type { JobEvent } from '../api/sse';

export type TransportKind = 'http' | 'native';

export type Transport = {
  createJob: (payload: JobPayload, request?: { signal?: AbortSignal }) => Promise<{ jobId: string }>;
  streamJobEvents: (
    jobId: string,
    onEvent: (event: JobEvent) => void,
    request?: { signal?: AbortSignal }
  ) => Promise<void>;
  respondToJobRequest: (
    jobId: string,
    payload: { requestId: number | string; result: unknown },
    request?: { signal?: AbortSignal }
  ) => Promise<unknown>;

  fetchClaudeRuntimeMetadata: () => Promise<ClaudeRuntimeMetadata>;
  fetchCodexRuntimeMetadata: () => Promise<CodexRuntimeMetadata>;
  fetchHostToolsStatus: () => Promise<HostToolsStatus>;
  setHostToolsEnabled: (enabled: boolean) => Promise<{ toolsEnabled: boolean }>;
  updateClaudeRuntimePreferences: (payload: {
    model?: string | null;
    thinkingMode?: string | null;
  }) => Promise<{
    currentModel: string | null;
    modelSource?: string;
    currentThinkingMode: string;
    maxThinkingTokens: number | null;
  }>;
  fetchClaudeRuntimeContextUsage: () => Promise<ClaudeContextUsageResponse>;
  fetchCodexRuntimeContextUsage: (payload?: { threadId?: string }) => Promise<CodexContextUsageResponse>;
  fetchHostHealth: () => Promise<HostHealthResponse>;
};

export function createTransport(options: Options): Transport {
  const kind = options.transport === 'native' ? 'native' : 'http';
  return (kind === 'native' ? nativeTransport(options) : httpTransport(options)) as Transport;
}
