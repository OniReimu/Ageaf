import type { Options } from '../../types';
import { createTransport } from '../messaging/transport';
import type { JobEvent } from './sse';

// Re-export types from httpClient
export type {
  JobPayload,
  ClaudeRuntimeMetadata,
  CodexRuntimeMetadata,
  HostToolsStatus,
  ClaudeContextUsageResponse,
  CodexContextUsageResponse,
} from './httpClient';

export { JobEvent };

export async function createJob(
  options: Options,
  payload: Parameters<ReturnType<typeof createTransport>['createJob']>[0],
  request?: { signal?: AbortSignal }
) {
  return createTransport(options).createJob(payload, request);
}

export async function streamJobEvents(
  options: Options,
  jobId: string,
  onEvent: (event: JobEvent) => void,
  request?: { signal?: AbortSignal }
) {
  return createTransport(options).streamJobEvents(jobId, onEvent, request);
}

export async function respondToJobRequest(
  options: Options,
  jobId: string,
  payload: { requestId: number | string; result: unknown },
  request?: { signal?: AbortSignal }
) {
  return createTransport(options).respondToJobRequest(jobId, payload, request);
}

export async function fetchClaudeRuntimeMetadata(options: Options) {
  return createTransport(options).fetchClaudeRuntimeMetadata();
}

export async function fetchCodexRuntimeMetadata(options: Options) {
  return createTransport(options).fetchCodexRuntimeMetadata();
}

export async function fetchHostToolsStatus(options: Options) {
  return createTransport(options).fetchHostToolsStatus();
}

export async function setHostToolsEnabled(options: Options, enabled: boolean) {
  return createTransport(options).setHostToolsEnabled(enabled);
}

export async function updateClaudeRuntimePreferences(
  options: Options,
  payload: { model?: string | null; thinkingMode?: string | null }
) {
  return createTransport(options).updateClaudeRuntimePreferences(payload);
}

export async function fetchClaudeRuntimeContextUsage(options: Options) {
  return createTransport(options).fetchClaudeRuntimeContextUsage();
}

export async function fetchCodexRuntimeContextUsage(
  options: Options,
  payload?: { threadId?: string }
) {
  return createTransport(options).fetchCodexRuntimeContextUsage(payload);
}

export async function fetchHostHealth(options: Options) {
  return createTransport(options).fetchHostHealth();
}
