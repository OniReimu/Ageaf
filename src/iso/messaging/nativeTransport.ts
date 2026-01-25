import type { Options } from '../../types';
import type { NativeHostRequest, NativeHostResponse } from './nativeProtocol';

function sendNativeRequest(request: NativeHostRequest, options?: { timeoutMs?: number }) {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  return new Promise<NativeHostResponse>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
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
      if (response.kind !== 'response') throw new Error('native createJob failed');
      return response.body as { jobId: string };
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
      if (response.kind !== 'response') throw new Error('native respond failed');
      return response.body ?? {};
    },

    async fetchClaudeRuntimeMetadata() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/runtime/claude/metadata' },
      });
      if (response.kind !== 'response') throw new Error('native metadata failed');
      return response.body;
    },

    async fetchCodexRuntimeMetadata() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/runtime/codex/metadata', body: {} },
      });
      if (response.kind !== 'response') throw new Error('native metadata failed');
      return response.body;
    },

    async fetchHostToolsStatus() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/host/tools' },
      });
      if (response.kind !== 'response') throw new Error('native host tools failed');
      return response.body;
    },

    async setHostToolsEnabled(enabled: boolean) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/host/tools', body: { enabled } },
      });
      if (response.kind !== 'response') throw new Error('native host tools update failed');
      return response.body;
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
      if (response.kind !== 'response') throw new Error('native preferences failed');
      return response.body;
    },

    async fetchClaudeRuntimeContextUsage() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/runtime/claude/context?sessionScope=project' },
      });
      if (response.kind !== 'response') throw new Error('native context failed');
      return response.body;
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
      if (response.kind !== 'response') throw new Error('native context failed');
      return response.body;
    },

    async fetchHostHealth() {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'GET', path: '/v1/health' },
      });
      if (response.kind !== 'response') throw new Error('native health failed');
      return response.body;
    },
  };
}
