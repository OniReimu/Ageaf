import type { Options } from '../../types';
import {
  createJob as httpCreateJob,
  streamJobEvents as httpStreamJobEvents,
  respondToJobRequest as httpRespondToJobRequest,
  fetchClaudeRuntimeMetadata as httpFetchClaudeRuntimeMetadata,
  fetchCodexRuntimeMetadata as httpFetchCodexRuntimeMetadata,
  fetchHostToolsStatus as httpFetchHostToolsStatus,
  setHostToolsEnabled as httpSetHostToolsEnabled,
  updateClaudeRuntimePreferences as httpUpdateClaudeRuntimePreferences,
  fetchClaudeRuntimeContextUsage as httpFetchClaudeRuntimeContextUsage,
  fetchCodexRuntimeContextUsage as httpFetchCodexRuntimeContextUsage,
  fetchHostHealth as httpFetchHostHealth,
  type JobPayload,
} from '../api/httpClient';

export function httpTransport(options: Options) {
  return {
    createJob: (
      payload: JobPayload,
      request?: { signal?: AbortSignal }
    ) => httpCreateJob(options, payload, request),

    streamJobEvents: (
      jobId: string,
      onEvent: Parameters<typeof httpStreamJobEvents>[2],
      request?: { signal?: AbortSignal }
    ) => httpStreamJobEvents(options, jobId, onEvent, request),

    respondToJobRequest: (
      jobId: string,
      payload: { requestId: number | string; result: unknown },
      request?: { signal?: AbortSignal }
    ) => httpRespondToJobRequest(options, jobId, payload, request),

    fetchClaudeRuntimeMetadata: () => httpFetchClaudeRuntimeMetadata(options),

    fetchCodexRuntimeMetadata: () => httpFetchCodexRuntimeMetadata(options),

    fetchHostToolsStatus: () => httpFetchHostToolsStatus(options),

    setHostToolsEnabled: (enabled: boolean) => httpSetHostToolsEnabled(options, enabled),

    updateClaudeRuntimePreferences: (
      payload: { model?: string | null; thinkingMode?: string | null }
    ) => httpUpdateClaudeRuntimePreferences(options, payload),

    fetchClaudeRuntimeContextUsage: () => httpFetchClaudeRuntimeContextUsage(options),

    fetchCodexRuntimeContextUsage: (
      payload?: { threadId?: string }
    ) => httpFetchCodexRuntimeContextUsage(options, payload),

    fetchHostHealth: () => httpFetchHostHealth(options),
  };
}
