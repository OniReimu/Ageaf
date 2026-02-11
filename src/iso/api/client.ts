import type { Options } from '../../types';
import { createTransport } from '../messaging/transport';
import {
  type AttachmentMeta,
  type ClaudeContextUsageResponse,
  type ClaudeRuntimeMetadata,
  type CodexContextUsageResponse,
  type CodexRuntimeMetadata,
  type HostHealthResponse,
  type JobPayload,
  type PiContextUsageResponse,
  type PiRuntimeMetadata,
  validateDocumentEntries,
} from './httpClient';
import { streamEvents, type JobEvent } from './sse';

export { streamEvents, validateDocumentEntries };
export type {
  AttachmentMeta,
  ClaudeContextUsageResponse,
  ClaudeRuntimeMetadata,
  CodexContextUsageResponse,
  CodexRuntimeMetadata,
  HostHealthResponse,
  JobEvent,
  JobPayload,
  PiContextUsageResponse,
  PiRuntimeMetadata,
};

export async function createJob(
  options: Options,
  payload: JobPayload,
  request?: { signal?: AbortSignal }
): Promise<{ jobId: string }> {
  return createTransport(options).createJob(payload, request);
}

export async function streamJobEvents(
  options: Options,
  jobId: string,
  onEvent: (event: JobEvent) => void,
  request?: { signal?: AbortSignal }
): Promise<void> {
  return createTransport(options).streamJobEvents(jobId, onEvent, request);
}

export async function respondToJobRequest(
  options: Options,
  jobId: string,
  payload: { requestId: number | string; result: unknown },
  request?: { signal?: AbortSignal }
): Promise<unknown> {
  return createTransport(options).respondToJobRequest(jobId, payload, request);
}

export async function fetchClaudeRuntimeMetadata(options: Options): Promise<ClaudeRuntimeMetadata> {
  return createTransport(options).fetchClaudeRuntimeMetadata();
}

export async function fetchCodexRuntimeMetadata(options: Options): Promise<CodexRuntimeMetadata> {
  return createTransport(options).fetchCodexRuntimeMetadata();
}

export async function updateClaudeRuntimePreferences(
  options: Options,
  payload: { model?: string | null; thinkingMode?: string | null }
): Promise<{
  currentModel: string | null;
  modelSource?: string;
  currentThinkingMode: string;
  maxThinkingTokens: number | null;
}> {
  return createTransport(options).updateClaudeRuntimePreferences(payload);
}

export async function fetchClaudeRuntimeContextUsage(
  options: Options
): Promise<ClaudeContextUsageResponse> {
  return createTransport(options).fetchClaudeRuntimeContextUsage();
}

export async function fetchCodexRuntimeContextUsage(
  options: Options,
  payload?: { threadId?: string }
): Promise<CodexContextUsageResponse> {
  return createTransport(options).fetchCodexRuntimeContextUsage(payload);
}

export async function fetchPiRuntimeMetadata(options: Options): Promise<PiRuntimeMetadata> {
  return createTransport(options).fetchPiRuntimeMetadata();
}

export async function updatePiRuntimePreferences(
  options: Options,
  payload: { provider?: string | null; model?: string | null; thinkingLevel?: string | null }
): Promise<{
  currentProvider: string | null;
  currentModel: string | null;
  currentThinkingLevel: string;
  thinkingLevels?: Array<{ id: string; label: string }>;
}> {
  return createTransport(options).updatePiRuntimePreferences(payload);
}

export async function fetchPiRuntimeContextUsage(
  options: Options,
  conversationId?: string
): Promise<PiContextUsageResponse> {
  return createTransport(options).fetchPiRuntimeContextUsage(conversationId);
}

export async function fetchHostHealth(options: Options): Promise<HostHealthResponse> {
  return createTransport(options).fetchHostHealth();
}

export async function openAttachmentDialog(
  options: Options,
  payload: { multiple?: boolean; extensions?: string[] }
): Promise<{ paths: string[] }> {
  return createTransport(options).openAttachmentDialog(payload);
}

export async function validateAttachmentEntries(
  options: Options,
  payload: Parameters<ReturnType<typeof createTransport>['validateAttachmentEntries']>[0]
): ReturnType<ReturnType<typeof createTransport>['validateAttachmentEntries']> {
  return createTransport(options).validateAttachmentEntries(payload);
}

export async function deleteSession(
  options: Options,
  provider: 'claude' | 'codex' | 'pi',
  sessionId: string
): Promise<void> {
  return createTransport(options).deleteSession(provider, sessionId);
}
