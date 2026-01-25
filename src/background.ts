'use strict';

import type { NativeHostRequest, NativeHostResponse } from './iso/messaging/nativeProtocol';

const NATIVE_HOST_NAME = 'com.ageaf.host';
let nativePort: chrome.runtime.Port | null = null;
const pending = new Map<string, (response: NativeHostResponse) => void>();
const streamPorts = new Map<string, chrome.runtime.Port>();

function ensureNativePort(): chrome.runtime.Port | null {
  if (nativePort) return nativePort;

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  } catch {
    nativePort = null;
    return null;
  }

  nativePort.onMessage.addListener((message: NativeHostResponse) => {
    const handler = pending.get(message.id);
    if (handler) {
      pending.delete(message.id);
      handler(message);
      return;
    }
    const streamPort = streamPorts.get(message.id);
    if (streamPort) {
      try {
        streamPort.postMessage(message);
      } catch {
        streamPorts.delete(message.id);
      }
      if (message.kind === 'end' || message.kind === 'error') {
        streamPorts.delete(message.id);
      }
    }
  });
  nativePort.onDisconnect.addListener(() => {
    const errorMessage = chrome.runtime.lastError?.message || 'Native host disconnected';

    // Drain all pending requests with error
    for (const [id, handler] of pending.entries()) {
      handler({ id, kind: 'error', message: errorMessage });
    }
    pending.clear();

    // Drain all streaming ports with error
    for (const [id, port] of streamPorts.entries()) {
      try {
        port.postMessage({ id, kind: 'error', message: errorMessage });
      } catch {
        // Port may already be disconnected, ignore
      }
    }
    streamPorts.clear();

    nativePort = null;
  });
  return nativePort;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ageaf:native-request') {
    const request = message.request as NativeHostRequest;
    const port = ensureNativePort();
    if (!port) {
      sendResponse({ id: request.id, kind: 'error', message: 'native_unavailable' });
      return undefined;
    }
    pending.set(request.id, sendResponse);
    try {
      port.postMessage(request);
    } catch {
      pending.delete(request.id);
      sendResponse({ id: request.id, kind: 'error', message: 'native_unavailable' });
      return undefined;
    }
    return true;
  }
  if (message?.type === 'ageaf:native-cancel') {
    const requestId = message.requestId as string;
    pending.delete(requestId);
    return undefined;
  }
  return undefined;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ageaf:native-stream') return;
  const native = ensureNativePort();
  if (!native) {
    port.onMessage.addListener((message: NativeHostRequest) => {
      try {
        port.postMessage({ id: message.id, kind: 'error', message: 'native_unavailable' });
      } catch {
        // ignore
      }
      try {
        port.disconnect();
      } catch {
        // ignore
      }
    });
    return;
  }
  port.onMessage.addListener((message: NativeHostRequest) => {
    streamPorts.set(message.id, port);
    try {
      native.postMessage(message);
    } catch {
      streamPorts.delete(message.id);
      try {
        port.postMessage({ id: message.id, kind: 'error', message: 'Native host disconnected' });
      } catch {
        // ignore
      }
      try {
        port.disconnect();
      } catch {
        // ignore
      }
    }
  });
  port.onDisconnect.addListener(() => {
    for (const [key, value] of streamPorts.entries()) {
      if (value === port) streamPorts.delete(key);
    }
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: 'ageaf:open-settings' }, () => {
      // It's expected that most tabs won't have our content script injected.
      // Avoid unhandled promise rejections like:
      // "Could not establish connection. Receiving end does not exist."
      void chrome.runtime.lastError;
    });
  });
});
