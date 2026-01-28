// Re-export all API functions from httpClient and sse
export {
  createJob,
  streamJobEvents,
  respondToJobRequest,
  fetchClaudeRuntimeMetadata,
  fetchCodexRuntimeMetadata,
  fetchHostToolsStatus,
  setHostToolsEnabled,
  updateClaudeRuntimePreferences,
  fetchClaudeRuntimeContextUsage,
  fetchCodexRuntimeContextUsage,
  fetchHostHealth,
  openAttachmentDialog,
  validateAttachmentEntries,
  type JobPayload,
  type ClaudeRuntimeMetadata,
  type CodexRuntimeMetadata,
  type HostToolsStatus,
  type ClaudeContextUsageResponse,
  type CodexContextUsageResponse,
  type HostHealthResponse,
  type AttachmentMeta,
} from './httpClient';

export { streamEvents, type JobEvent } from './sse';

// Session deletion API
export async function deleteSession(
  options: { hostUrl?: string },
  provider: 'claude' | 'codex',
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
    throw new Error(
      `Session deletion failed (${response.status})${text ? `: ${text}` : ''}`
    );
  }
}
