import type { Options } from '../../types';
import type { NativeHostRequest, NativeHostResponse } from './nativeProtocol';
import type { Transport } from './transport';
import type {
  ClaudeContextUsageResponse,
  ClaudeRuntimeMetadata,
  CodexContextUsageResponse,
  CodexRuntimeMetadata,
  HostHealthResponse,
  JobPayload,
  AttachmentMeta,
  PiContextUsageResponse,
  PiRuntimeMetadata,
} from '../api/httpClient';
import type { JobEvent } from '../api/sse';

function unwrapNativeResponse(response: NativeHostResponse): unknown {
  if (response.kind === 'error') {
    throw new Error(response.message);
  }
  if (response.kind !== 'response') {
    throw new Error(`Unexpected response kind: ${response.kind}`);
  }
  if (response.status < 200 || response.status >= 300) {
    const message =
      typeof response.body === 'object' && response.body && 'message' in response.body
        ? String((response.body as { message: unknown }).message)
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return response.body;
}

function sendNativeRequest(request: NativeHostRequest, options?: { timeoutMs?: number }) {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  return new Promise<NativeHostResponse>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Cancel the pending request in background
      if (request.kind === 'request') {
        chrome.runtime.sendMessage({ type: 'ageaf:native-cancel', requestId: request.id });
      }
      reject(new Error('native request timed out'));
    }, timeoutMs);

    chrome.runtime.sendMessage({ type: 'ageaf:native-request', request }, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);

      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response as NativeHostResponse);
    });
  });
}

export function nativeTransport(_options: Options): Transport {
  const options = _options;
  return {
    async createJob(payload: JobPayload) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/jobs', body: payload },
      });
      return unwrapNativeResponse(response) as { jobId: string };
    },

    async streamJobEvents(
      jobId: string,
      onEvent: (event: JobEvent) => void,
      request?: { signal?: AbortSignal }
    ) {
      return new Promise<void>((resolve, reject) => {
        const port = chrome.runtime.connect({ name: 'ageaf:native-stream' });
        const requestId = crypto.randomUUID();
        let finished = false;

        const cleanup = () => {
          if (finished) return;
          finished = true;
          try {
            port.onMessage.removeListener(onMessage);
          } catch {
            // ignore
          }
          try {
            port.onDisconnect.removeListener(onDisconnect);
          } catch {
            // ignore
          }
          try {
            port.disconnect();
          } catch {
            // ignore
          }
        };

        const onDisconnect = () => {
          const error = chrome.runtime.lastError;
          if (finished) return;
          cleanup();
          if (error?.message) {
            reject(new Error(error.message));
            return;
          }
          // If the port closes without an explicit end, treat it as an error.
          reject(new Error('native stream disconnected'));
        };

        const onMessage = (message: NativeHostResponse) => {
          if (message.id !== requestId) return;
          if (message.kind === 'event') {
            onEvent(message.event);
            return;
          }
          if (message.kind === 'end') {
            cleanup();
            resolve();
            return;
          }
          if (message.kind === 'error') {
            cleanup();
            reject(new Error(message.message));
          }
        };

        port.onMessage.addListener(onMessage);
        port.onDisconnect.addListener(onDisconnect);
        request?.signal?.addEventListener(
          'abort',
          () => {
            cleanup();
            reject(new Error('aborted'));
          },
          { once: true }
        );

        port.postMessage({
          id: requestId,
          kind: 'request',
          request: { method: 'GET', path: `/v1/jobs/${jobId}/events`, stream: true },
        } as NativeHostRequest);
      });
    },

    async respondToJobRequest(jobId: string, payload: { requestId: number | string; result: unknown }) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: `/v1/jobs/${jobId}/respond`, body: payload },
      });
      return unwrapNativeResponse(response) ?? {};
    },

    async fetchClaudeRuntimeMetadata() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/runtime/claude/metadata' },
      });
      return unwrapNativeResponse(response) as ClaudeRuntimeMetadata;
    },

    async fetchCodexRuntimeMetadata() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: {
          method: 'POST',
          path: '/v1/runtime/codex/metadata',
          body: {
            cliPath: options.openaiCodexCliPath,
            envVars: options.openaiEnvVars,
          },
        },
      });
      return unwrapNativeResponse(response) as CodexRuntimeMetadata;
    },

    async updateClaudeRuntimePreferences(payload: {
      model?: string | null;
      thinkingMode?: string | null;
    }) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/runtime/claude/preferences', body: payload },
      });
      return unwrapNativeResponse(response) as {
        currentModel: string | null;
        modelSource?: string;
        currentThinkingMode: string;
        maxThinkingTokens: number | null;
      };
    },

    async fetchClaudeRuntimeContextUsage() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/runtime/claude/context?sessionScope=project' },
      });
      return unwrapNativeResponse(response) as ClaudeContextUsageResponse;
    },

    async fetchCodexRuntimeContextUsage(payload?: { threadId?: string }) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: {
          method: 'POST',
          path: '/v1/runtime/codex/context',
          body: {
            cliPath: options.openaiCodexCliPath,
            envVars: options.openaiEnvVars,
            threadId: payload?.threadId,
          },
        },
      });
      return unwrapNativeResponse(response) as CodexContextUsageResponse;
    },

    async fetchPiRuntimeMetadata() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/runtime/pi/metadata' },
      });
      return unwrapNativeResponse(response) as PiRuntimeMetadata;
    },

    async updatePiRuntimePreferences(payload: {
      provider?: string | null;
      model?: string | null;
      thinkingLevel?: string | null;
    }) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/runtime/pi/preferences', body: payload },
      });
      return unwrapNativeResponse(response) as {
        currentProvider: string | null;
        currentModel: string | null;
        currentThinkingLevel: string;
        thinkingLevels?: Array<{ id: string; label: string }>;
      };
    },

    async fetchPiRuntimeContextUsage(conversationId?: string) {
      const qs = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: `/v1/runtime/pi/context${qs}` },
      });
      return unwrapNativeResponse(response) as PiContextUsageResponse;
    },

    async fetchHostHealth() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/health' },
      });
      return unwrapNativeResponse(response) as HostHealthResponse;
    },

    async openAttachmentDialog(payload: { multiple?: boolean; extensions?: string[] }) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/attachments/open', body: payload },
      });
      return unwrapNativeResponse(response) as { paths: string[] };
    },

    async validateAttachmentEntries(payload: {
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
    }) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/attachments/validate', body: payload },
      });
      return unwrapNativeResponse(response) as {
        attachments: AttachmentMeta[];
        errors: Array<{ id?: string; path?: string; message: string }>;
      };
    },

    async deleteSession(provider: 'claude' | 'codex' | 'pi', sessionId: string): Promise<void> {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'DELETE', path: `/v1/sessions/${provider}/${sessionId}` },
      });
      unwrapNativeResponse(response);
    },
  };
}
