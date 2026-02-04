import type { Options } from '../../types';
import type { Transport } from './transport';
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
  openAttachmentDialog as httpOpenAttachmentDialog,
  validateAttachmentEntries as httpValidateAttachmentEntries,
  deleteSession as httpDeleteSession,
  type JobPayload,
} from '../api/httpClient';

export function httpTransport(options: Options): Transport {
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

    openAttachmentDialog: (
      payload: Parameters<typeof httpOpenAttachmentDialog>[1]
    ) => httpOpenAttachmentDialog(options, payload),

    validateAttachmentEntries: (
      payload: Parameters<typeof httpValidateAttachmentEntries>[1]
    ) => httpValidateAttachmentEntries(options, payload),

    deleteSession: (
      provider: Parameters<typeof httpDeleteSession>[1],
      sessionId: Parameters<typeof httpDeleteSession>[2]
    ) => httpDeleteSession(options, provider, sessionId),
  };
}
