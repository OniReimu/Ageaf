import type { Options } from '../../types';
import type { NativeHostRequest, NativeHostResponse } from './nativeProtocol';

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

export function nativeTransport(_options: Options) {
  return {
    async createJob(payload: unknown) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/jobs', body: payload },
      });
      return unwrapNativeResponse(response) as { jobId: string };
    },

    async streamJobEvents(
      jobId: string,
      onEvent: (event: { event: string; data: unknown }) => void,
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

    async respondToJobRequest(jobId: string, payload: unknown) {
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
      return unwrapNativeResponse(response);
    },

    async fetchCodexRuntimeMetadata() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/runtime/codex/metadata', body: {} },
      });
      return unwrapNativeResponse(response);
    },

    async fetchHostToolsStatus() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/host/tools' },
      });
      return unwrapNativeResponse(response);
    },

    async setHostToolsEnabled(enabled: boolean) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/host/tools', body: { enabled } },
      });
      return unwrapNativeResponse(response);
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
      return unwrapNativeResponse(response);
    },

    async fetchClaudeRuntimeContextUsage() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/runtime/claude/context?sessionScope=project' },
      });
      return unwrapNativeResponse(response);
    },

    async fetchCodexRuntimeContextUsage(payload?: { threadId?: string }) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: {
          method: 'POST',
          path: '/v1/runtime/codex/context',
          body: payload ?? {},
        },
      });
      return unwrapNativeResponse(response);
    },

    async fetchHostHealth() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/health' },
      });
      return unwrapNativeResponse(response);
    },
  };
}
