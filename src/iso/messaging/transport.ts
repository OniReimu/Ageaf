import type { Options } from '../../types';
import { httpTransport } from './httpTransport';
import { nativeTransport } from './nativeTransport';
import type {
  AttachmentMeta,
  ClaudeContextUsageResponse,
  ClaudeRuntimeMetadata,
  CodexContextUsageResponse,
  CodexRuntimeMetadata,
  HostHealthResponse,
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

  openAttachmentDialog: (payload: { multiple?: boolean; extensions?: string[] }) => Promise<{ paths: string[] }>;
  validateAttachmentEntries: (payload: {
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
  }) => Promise<{
    attachments: AttachmentMeta[];
    errors: Array<{ id?: string; path?: string; message: string }>;
  }>;

  deleteSession: (provider: 'claude' | 'codex', sessionId: string) => Promise<void>;
};

export function createTransport(options: Options): Transport {
  const kind = options.transport === 'native' ? 'native' : 'http';
  return (kind === 'native' ? nativeTransport(options) : httpTransport(options)) as Transport;
}
