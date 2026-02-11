import type { Options } from '../../types';
import type { Transport } from './transport';
import {
  createJob as httpCreateJob,
  streamJobEvents as httpStreamJobEvents,
  respondToJobRequest as httpRespondToJobRequest,
  fetchClaudeRuntimeMetadata as httpFetchClaudeRuntimeMetadata,
  fetchCodexRuntimeMetadata as httpFetchCodexRuntimeMetadata,
  updateClaudeRuntimePreferences as httpUpdateClaudeRuntimePreferences,
  fetchClaudeRuntimeContextUsage as httpFetchClaudeRuntimeContextUsage,
  fetchCodexRuntimeContextUsage as httpFetchCodexRuntimeContextUsage,
  fetchPiRuntimeMetadata as httpFetchPiRuntimeMetadata,
  updatePiRuntimePreferences as httpUpdatePiRuntimePreferences,
  fetchPiRuntimeContextUsage as httpFetchPiRuntimeContextUsage,
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

    updateClaudeRuntimePreferences: (
      payload: { model?: string | null; thinkingMode?: string | null }
    ) => httpUpdateClaudeRuntimePreferences(options, payload),

    fetchClaudeRuntimeContextUsage: () => httpFetchClaudeRuntimeContextUsage(options),

    fetchCodexRuntimeContextUsage: (
      payload?: { threadId?: string }
    ) => httpFetchCodexRuntimeContextUsage(options, payload),

    fetchPiRuntimeMetadata: () => httpFetchPiRuntimeMetadata(options),

    updatePiRuntimePreferences: (
      payload: { provider?: string | null; model?: string | null; thinkingLevel?: string | null }
    ) => httpUpdatePiRuntimePreferences(options, payload),

    fetchPiRuntimeContextUsage: (
      conversationId?: string
    ) => httpFetchPiRuntimeContextUsage(options, conversationId),

    fetchHostHealth: () => httpFetchHostHealth(options),

    openAttachmentDialog: (
      payload: Parameters<typeof httpOpenAttachmentDialog>[1]
    ) => httpOpenAttachmentDialog(options, payload),

    validateAttachmentEntries: (
      payload: Parameters<typeof httpValidateAttachmentEntries>[1]
    ) => httpValidateAttachmentEntries(options, payload),

    deleteSession: (
      provider: 'claude' | 'codex' | 'pi',
      sessionId: string
    ) => httpDeleteSession(options, provider, sessionId),
  };
}
