'use strict';

import type { NativeHostRequest, NativeHostResponse } from './iso/messaging/nativeProtocol';

const NATIVE_HOST_NAME = 'com.ageaf.host';
let nativePort: chrome.runtime.Port | null = null;
const pending = new Map<string, (response: NativeHostResponse) => void>();
const streamPorts = new Map<string, chrome.runtime.Port>();

function ensureNativePort() {
  if (nativePort) return nativePort;
  nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  nativePort.onMessage.addListener((message: NativeHostResponse) => {
    const handler = pending.get(message.id);
    if (handler) {
      pending.delete(message.id);
      handler(message);
      return;
    }
    const streamPort = streamPorts.get(message.id);
    if (streamPort) {
      streamPort.postMessage(message);
      if (message.kind === 'end' || message.kind === 'error') {
        streamPorts.delete(message.id);
      }
    }
  });
  nativePort.onDisconnect.addListener(() => {
    nativePort = null;
  });
  return nativePort;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ageaf:native-request') {
    const port = ensureNativePort();
    const request = message.request as NativeHostRequest;
    pending.set(request.id, sendResponse);
    port.postMessage(request);
    return true;
  }
  return undefined;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ageaf:native-stream') return;
  const native = ensureNativePort();
  port.onMessage.addListener((message: NativeHostRequest) => {
    streamPorts.set(message.id, port);
    native.postMessage(message);
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
