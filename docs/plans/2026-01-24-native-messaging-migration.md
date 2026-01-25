# Native Messaging Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add native messaging support to Ageaf while preserving HTTP dev mode and providing a transport toggle + host availability UX.

**Architecture:** The extension selects a transport (HTTP or Native). HTTP keeps the current fetch + SSE flow. Native uses the background service worker to connect to a Chrome Native Messaging host, which reuses the Fastify server via `server.inject()` for normal routes and a shared job subscription API for streaming events. Packaging scripts register a native host manifest and ship a bundled binary.

**Tech Stack:** TypeScript, Preact, Chrome MV3 (`runtime.connectNative`), Fastify, Node.js streams, `tsx` + `node:test`.

**Skills:** @superpowers:test-driven-development, @superpowers:systematic-debugging (if tests fail), @superpowers:verification-before-completion

---

### Task 0: Repo hygiene (pre-flight)

**Files:**
- None

**Step 1: Check status**

Run: `git status -sb`
Expected: You are on a feature branch and understand any existing dirty changes.

**Step 2: Create a feature branch (if needed)**

Run: `git checkout -b feat/native-messaging-transport`
Expected: Switched to new branch.

**Step 3: Record current dirty state**

Run: `git status -sb`
Expected: Baseline noted before changes.

**Step 4: Commit only plan-related work later**

(No code yet; this step is a reminder to avoid mixing unrelated changes.)

---

### Task 1: Native messaging framing helpers (host)

**Files:**
- Create: `host/src/nativeMessaging/protocol.ts`
- Test: `host/test/native-messaging-protocol.test.ts`

**Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeNativeMessages, encodeNativeMessage } from '../src/nativeMessaging/protocol.js';

test('native messaging protocol round-trips JSON', () => {
  const input = { id: '1', kind: 'ping', payload: { ok: true } };
  const frame = encodeNativeMessage(input);
  const { messages, carry } = decodeNativeMessages(frame);
  assert.deepEqual(messages, [input]);
  assert.equal(carry.length, 0);
});

test('native messaging protocol buffers partial frames', () => {
  const input = { id: '2', kind: 'ping' };
  const frame = encodeNativeMessage(input);
  const first = frame.subarray(0, 3);
  const second = frame.subarray(3);

  const firstPass = decodeNativeMessages(first);
  assert.deepEqual(firstPass.messages, []);
  assert.equal(firstPass.carry.length, 3);

  const secondPass = decodeNativeMessages(Buffer.concat([firstPass.carry, second]));
  assert.deepEqual(secondPass.messages, [input]);
  assert.equal(secondPass.carry.length, 0);
});
```

**Step 2: Run test to verify it fails**

Run: `cd host && npm test -- native-messaging-protocol.test.ts`
Expected: FAIL with "Cannot find module" for `nativeMessaging/protocol`.

**Step 3: Write minimal implementation**

```ts
export type NativeMessage = Record<string, unknown>;

export function encodeNativeMessage(message: NativeMessage): Buffer {
  const json = JSON.stringify(message);
  const body = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export function decodeNativeMessages(buffer: Buffer): {
  messages: NativeMessage[];
  carry: Buffer;
} {
  const messages: NativeMessage[] = [];
  let offset = 0;

  while (buffer.length - offset >= 4) {
    const length = buffer.readUInt32LE(offset);
    if (buffer.length - offset - 4 < length) break;

    const payload = buffer
      .subarray(offset + 4, offset + 4 + length)
      .toString('utf8');
    messages.push(JSON.parse(payload) as NativeMessage);
    offset += 4 + length;
  }

  return { messages, carry: buffer.subarray(offset) };
}
```

**Step 4: Run test to verify it passes**

Run: `cd host && npm test -- native-messaging-protocol.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add host/src/nativeMessaging/protocol.ts host/test/native-messaging-protocol.test.ts
git commit -m "test: add native messaging framing coverage"
```

---

### Task 2: Expose job event subscription helpers (host)

**Files:**
- Modify: `host/src/routes/jobs.ts`
- Test: `host/test/native-messaging-jobs-subscribe.test.ts`

**Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { subscribeToJobEventsForTest, createJobForTest } from '../src/routes/jobs.js';

test('subscribeToJobEvents replays history and allows unsubscribe', () => {
  const jobId = createJobForTest('claude');
  const events: Array<{ event: string; data: unknown }> = [];

  const unsubscribe = subscribeToJobEventsForTest(jobId, {
    send: (event) => events.push(event),
    end: () => {},
  });

  assert.ok(unsubscribe);
  assert.equal(events.length > 0, true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd host && npm test -- native-messaging-jobs-subscribe.test.ts`
Expected: FAIL with "export not found" for helper functions.

**Step 3: Write minimal implementation**

Add to `host/src/routes/jobs.ts` (near top-level):

```ts
export type JobSubscriber = {
  send: (event: JobEvent) => void;
  end: () => void;
};

export function subscribeToJobEvents(jobId: string, subscriber: JobSubscriber) {
  const job = jobs.get(jobId);
  if (!job) return { ok: false as const, error: 'not_found' as const };

  for (const event of job.events) subscriber.send(event);
  if (job.done) {
    subscriber.end();
    return { ok: true as const, done: true as const };
  }

  job.subscribers.add(subscriber);
  return {
    ok: true as const,
    done: false as const,
    unsubscribe: () => job.subscribers.delete(subscriber),
  };
}

// Test-only helpers
export function createJobForTest(provider: 'claude' | 'codex') {
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    events: [{ event: 'plan', data: { message: 'Job queued' } }],
    subscribers: new Set(),
    done: false,
    provider,
  });
  return id;
}

export function subscribeToJobEventsForTest(jobId: string, subscriber: JobSubscriber) {
  const result = subscribeToJobEvents(jobId, subscriber);
  return result.ok && !result.done ? result.unsubscribe : undefined;
}
```

**Step 4: Run test to verify it passes**

Run: `cd host && npm test -- native-messaging-jobs-subscribe.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add host/src/routes/jobs.ts host/test/native-messaging-jobs-subscribe.test.ts
git commit -m "test: expose job event subscription helpers"
```

---

### Task 3: Native messaging host entrypoint (host)

**Files:**
- Create: `host/src/nativeMessaging.ts`
- Create: `host/src/native.ts`
- Modify: `host/src/server.ts`
- Test: `host/test/native-messaging-host.test.ts`

**Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { buildServer } from '../src/server.js';
import { runNativeMessagingHost } from '../src/nativeMessaging.js';
import { encodeNativeMessage, decodeNativeMessages } from '../src/nativeMessaging/protocol.js';

async function readOneMessage(stream: PassThrough) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
    const { messages } = decodeNativeMessages(Buffer.concat(chunks));
    if (messages.length > 0) return messages[0];
  }
  return null;
}

test('native messaging host answers health requests', async () => {
  process.env.AGEAF_START_SERVER = 'false';
  const server = buildServer();

  const input = new PassThrough();
  const output = new PassThrough();
  runNativeMessagingHost({ server, input, output });

  const request = {
    id: 'health-1',
    kind: 'request',
    request: { method: 'GET', path: '/v1/health' },
  };
  input.write(encodeNativeMessage(request));

  const response = (await readOneMessage(output)) as any;
  assert.equal(response.kind, 'response');
  assert.equal(response.id, 'health-1');
  assert.equal(response.status, 200);
});
```

**Step 2: Run test to verify it fails**

Run: `cd host && npm test -- native-messaging-host.test.ts`
Expected: FAIL with "Cannot find module" for `nativeMessaging`.

**Step 3: Write minimal implementation**

Create `host/src/nativeMessaging.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { decodeNativeMessages, encodeNativeMessage } from './nativeMessaging/protocol.js';
import { subscribeToJobEvents } from './routes/jobs.js';
import type { JobEvent } from './types.js';

export type NativeHostRequest = {
  id: string;
  kind: 'request';
  request: {
    method: 'GET' | 'POST';
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
    stream?: boolean;
  };
};

export type NativeHostResponse =
  | { id: string; kind: 'response'; status: number; body?: unknown; headers?: Record<string, string> }
  | { id: string; kind: 'event'; event: JobEvent }
  | { id: string; kind: 'end' }
  | { id: string; kind: 'error'; message: string };

export function runNativeMessagingHost({
  server,
  input = process.stdin,
  output = process.stdout,
}: {
  server: FastifyInstance;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}) {
  let carry = Buffer.alloc(0);

  const send = (message: NativeHostResponse) => {
    output.write(encodeNativeMessage(message));
  };

  input.on('data', async (chunk: Buffer) => {
    const { messages, carry: nextCarry } = decodeNativeMessages(
      Buffer.concat([carry, chunk])
    );
    carry = nextCarry;

    for (const message of messages) {
      const request = message as NativeHostRequest;
      if (request?.kind !== 'request') continue;

      if (request.request.stream && /\/v1\/jobs\/[^/]+\/events$/.test(request.request.path)) {
        const match = request.request.path.match(/\/v1\/jobs\/([^/]+)\/events/);
        const jobId = match?.[1];
        if (!jobId) {
          send({ id: request.id, kind: 'error', message: 'invalid_job_id' });
          continue;
        }

        const subscription = subscribeToJobEvents(jobId, {
          send: (event) => send({ id: request.id, kind: 'event', event }),
          end: () => send({ id: request.id, kind: 'end' }),
        });

        if (!subscription.ok) {
          send({ id: request.id, kind: 'error', message: subscription.error });
        }
        continue;
      }

      try {
        const reply = await server.inject({
          method: request.request.method,
          url: request.request.path,
          payload: request.request.body,
          headers: request.request.headers,
        });

        const bodyText = reply.body;
        let body: unknown = bodyText;
        try {
          body = bodyText ? JSON.parse(bodyText) : undefined;
        } catch {
          body = bodyText;
        }

        send({
          id: request.id,
          kind: 'response',
          status: reply.statusCode,
          headers: reply.headers as Record<string, string>,
          body,
        });
      } catch (error) {
        send({
          id: request.id,
          kind: 'error',
          message: error instanceof Error ? error.message : 'native_host_error',
        });
      }
    }
  });
}
```

Create `host/src/native.ts` (the runnable stdio entrypoint used by Chrome’s native host manifest):
```ts
#!/usr/bin/env node
import { buildServer } from './server.js';
import { runNativeMessagingHost } from './nativeMessaging.js';

// Prevent HTTP server auto-start
process.env.AGEAF_START_SERVER = 'false';

const server = buildServer();
runNativeMessagingHost({ server });
```

Update `host/src/server.ts` to export the server builder for native usage (already exported) and add a note comment near the auto-start block if needed.

**Step 4: Run test to verify it passes**

Run: `cd host && npm test -- native-messaging-host.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add host/src/nativeMessaging.ts host/src/native.ts host/src/server.ts host/test/native-messaging-host.test.ts
git commit -m "feat: add native messaging host entrypoint"
```

---

### Task 4: Add native host runtime script + manifest template (host)

**Files:**
- Modify: `host/package.json`
- Create: `host/native-messaging/manifest.template.json`
- Create: `host/scripts/build-native-manifest.mjs`
- Create: `host/scripts/README-native.md`
- Test: `host/test/native-messaging-manifest.test.ts`

**Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('native messaging manifest template exists', () => {
  const manifestPath = path.join(
    __dirname,
    '..',
    'native-messaging',
    'manifest.template.json'
  );
  assert.ok(fs.existsSync(manifestPath));
});
```

**Step 2: Run test to verify it fails**

Run: `cd host && npm test -- native-messaging-manifest.test.ts`
Expected: FAIL because the template does not exist.

**Step 3: Write minimal implementation**

Create `host/native-messaging/manifest.template.json`:

```json
{
  "name": "com.ageaf.host",
  "description": "Ageaf native messaging host",
  "path": "__AGEAF_HOST_PATH__",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://__AGEAF_EXTENSION_ID__/"]
}
```

Create `host/scripts/build-native-manifest.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [extensionId, hostPath, outPath] = process.argv.slice(2);
if (!extensionId || !hostPath || !outPath) {
  console.error('Usage: node build-native-manifest.mjs <extensionId> <hostPath> <outPath>');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(scriptDir, '..', 'native-messaging', 'manifest.template.json');
const template = fs.readFileSync(templatePath, 'utf8');
const output = template
  .replace(/__AGEAF_EXTENSION_ID__/g, extensionId)
  .replace(/__AGEAF_HOST_PATH__/g, hostPath.replace(/\\/g, '\\\\'));

fs.writeFileSync(outPath, output);
```

Create `host/scripts/README-native.md` with usage instructions (examples only):

````md
# Native Messaging Manifest

Example:

```bash
node host/scripts/build-native-manifest.mjs <extension-id> <host-binary-path> \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json"
```
````

Update `host/package.json` scripts:

```json
{
  "scripts": {
    "native": "tsx src/native.ts"
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd host && npm test -- native-messaging-manifest.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add host/package.json host/native-messaging/manifest.template.json host/scripts/build-native-manifest.mjs host/scripts/README-native.md host/test/native-messaging-manifest.test.ts
git commit -m "docs: add native messaging manifest template and script"
```

---

### Task 5: Background native messaging bridge (extension)

**Files:**
- Modify: `src/background.ts`
- Create: `src/iso/messaging/nativeProtocol.ts`
- Test: `test/native-bridge.test.cjs`

**Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('background registers native messaging bridge', () => {
  const backgroundPath = path.join(__dirname, '..', 'src', 'background.ts');
  const contents = fs.readFileSync(backgroundPath, 'utf8');

  assert.match(contents, /connectNative/);
  assert.match(contents, /ageaf:native-request/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/native-bridge.test.cjs`
Expected: FAIL because no native bridge exists yet.

**Step 3: Write minimal implementation**

Create `src/iso/messaging/nativeProtocol.ts`:

```ts
export type NativeHostRequest = {
  id: string;
  kind: 'request';
  request: {
    method: 'GET' | 'POST';
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
    stream?: boolean;
  };
};

export type NativeHostResponse =
  | { id: string; kind: 'response'; status: number; body?: unknown; headers?: Record<string, string> }
  | { id: string; kind: 'event'; event: { event: string; data: unknown } }
  | { id: string; kind: 'end' }
  | { id: string; kind: 'error'; message: string };
```

Update `src/background.ts`:

```ts
'use strict';

import type { NativeHostRequest, NativeHostResponse } from './iso/messaging/nativeProtocol';

const NATIVE_HOST_NAME = 'com.ageaf.host';
let nativePort: chrome.runtime.Port | null = null;
const pending = new Map<string, (response: NativeHostResponse) => void>();
const streamPorts = new Map<string, chrome.runtime.Port>();

function failPendingAndStreams(message: string) {
  for (const [id, sendResponse] of pending.entries()) {
    sendResponse({ id, kind: 'error', message });
  }
  pending.clear();

  for (const [id, port] of streamPorts.entries()) {
    try {
      port.postMessage({ id, kind: 'error', message } satisfies NativeHostResponse);
    } catch {
      // ignore
    }
  }
  streamPorts.clear();
}

function ensureNativePort() {
  if (nativePort) return nativePort;

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    nativePort = port;

    port.onMessage.addListener((message: NativeHostResponse) => {
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
    port.onDisconnect.addListener(() => {
      const errorMessage = chrome.runtime.lastError?.message ?? 'native_host_disconnected';
      failPendingAndStreams(errorMessage);
      nativePort = null;
    });

    return port;
  } catch {
    nativePort = null;
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ageaf:native-request') {
    const request = message.request as NativeHostRequest;
    const port = ensureNativePort();
    if (!port) {
      sendResponse({ id: request.id, kind: 'error', message: 'native_unavailable' });
      return;
    }
    pending.set(request.id, sendResponse);
    port.postMessage(request);
    return true;
  }
  return undefined;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ageaf:native-stream') return;
  const native = ensureNativePort();
  if (!native) {
    port.onMessage.addListener((message: NativeHostRequest) => {
      port.postMessage({ id: message.id, kind: 'error', message: 'native_unavailable' });
      port.disconnect();
    });
    return;
  }
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
    chrome.tabs.sendMessage(tabId, { type: 'ageaf:open-settings' });
  });
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/native-bridge.test.cjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/background.ts src/iso/messaging/nativeProtocol.ts test/native-bridge.test.cjs
git commit -m "feat: add native messaging bridge in background"
```

---

### Task 6: Transport abstraction (extension)

**Files:**
- Create: `src/iso/api/httpClient.ts`
- Create: `src/iso/messaging/httpTransport.ts`
- Create: `src/iso/messaging/nativeTransport.ts`
- Create: `src/iso/messaging/transport.ts`
- Modify: `src/iso/api/client.ts`
- Test: `test/iso-transport.test.cjs`

**Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('transport abstraction exists for native messaging', () => {
  const transportPath = path.join(__dirname, '..', 'src', 'iso', 'messaging', 'transport.ts');
  const contents = fs.readFileSync(transportPath, 'utf8');

  assert.match(contents, /createTransport/);
  assert.match(contents, /native/);
  assert.match(contents, /http/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/iso-transport.test.cjs`
Expected: FAIL because transport files do not exist.

**Step 3: Write minimal implementation**

Move the existing HTTP fetch logic from `src/iso/api/client.ts` into `src/iso/api/httpClient.ts` (same function names/exports). Then add transport wrappers.

Create `src/iso/api/httpClient.ts` (move the current HTTP implementation here, plus `fetchHostHealth`):

```ts
import type { Options } from '../../types';

import { streamEvents, JobEvent } from './sse';

export type JobPayload = {
  provider: 'claude' | 'codex';
  action: string;
  runtime?: {
    claude?: {
      cliPath?: string;
      envVars?: string;
      loadUserSettings?: boolean;
      model?: string;
      maxThinkingTokens?: number | null;
      sessionScope?: 'project' | 'home';
      yoloMode?: boolean;
    };
    codex?: {
      cliPath?: string;
      envVars?: string;
      approvalPolicy?: 'untrusted' | 'on-request' | 'on-failure' | 'never';
      model?: string;
      reasoningEffort?: string;
      threadId?: string;
    };
  };
  overleaf?: {
    url?: string;
    projectId?: string;
    doc?: string;
  };
  context?: {
    selection?: string;
    surroundingBefore?: string;
    surroundingAfter?: string;
    compileLog?: string;
    message?: string;
  };
  policy?: {
    requireApproval?: boolean;
    allowNetwork?: boolean;
    maxFiles?: number;
  };
  userSettings?: {
    displayName?: string;
    customSystemPrompt?: string;
    enableTools?: boolean;
    enableCommandBlocklist?: boolean;
    blockedCommandsUnix?: string;
  };
};

export async function createJob(
  options: Options,
  payload: JobPayload,
  request?: { signal?: AbortSignal }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(new URL('/v1/jobs', options.hostUrl).toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: request?.signal,
  });

  if (!response.ok) {
    throw new Error(`Job request failed (${response.status})`);
  }

  return response.json() as Promise<{ jobId: string }>;
}

export async function streamJobEvents(
  options: Options,
  jobId: string,
  onEvent: (event: JobEvent) => void,
  request?: { signal?: AbortSignal }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const url = new URL(`/v1/jobs/${jobId}/events`, options.hostUrl).toString();
  await streamEvents(url, onEvent, { signal: request?.signal });
}

export async function respondToJobRequest(
  options: Options,
  jobId: string,
  payload: { requestId: number | string; result: unknown },
  request?: { signal?: AbortSignal }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL(`/v1/jobs/${jobId}/respond`, options.hostUrl).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: request?.signal,
    }
  );

  if (!response.ok) {
    throw new Error(`Job respond failed (${response.status})`);
  }

  return response.json().catch(() => ({}));
}

export type ClaudeRuntimeMetadata = {
  models: Array<{ value: string; displayName: string; description: string }>;
  currentModel: string | null;
  modelSource?: string;
  thinkingModes: Array<{ id: string; label: string; maxThinkingTokens: number | null }>;
  currentThinkingMode: string;
  maxThinkingTokens: number | null;
};

export async function fetchClaudeRuntimeMetadata(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/claude/metadata', options.hostUrl).toString()
  );

  if (!response.ok) {
    throw new Error(`Runtime metadata request failed (${response.status})`);
  }

  return response.json() as Promise<ClaudeRuntimeMetadata>;
}

export type CodexRuntimeMetadata = {
  models: Array<{
    value: string;
    displayName: string;
    description: string;
    supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
    defaultReasoningEffort: string;
    isDefault: boolean;
  }>;
  currentModel: string | null;
  currentReasoningEffort: string | null;
};

export async function fetchCodexRuntimeMetadata(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/codex/metadata', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cliPath: options.openaiCodexCliPath,
        envVars: options.openaiEnvVars,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Runtime metadata request failed (${response.status})`);
  }

  return response.json() as Promise<CodexRuntimeMetadata>;
}

export type HostToolsStatus = {
  toolsEnabled: boolean;
  toolsAvailable: boolean;
  remoteToggleAllowed: boolean;
};

export async function fetchHostToolsStatus(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(new URL('/v1/host/tools', options.hostUrl).toString());
  if (!response.ok) {
    throw new Error(`Host tools status request failed (${response.status})`);
  }
  return response.json() as Promise<HostToolsStatus>;
}

export async function setHostToolsEnabled(options: Options, enabled: boolean) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(new URL('/v1/host/tools', options.hostUrl).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Host tools update failed (${response.status})${text ? `: ${text}` : ''}`
    );
  }
  return response.json() as Promise<{ toolsEnabled: boolean }>;
}

export async function updateClaudeRuntimePreferences(
  options: Options,
  payload: { model?: string | null; thinkingMode?: string | null }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/claude/preferences', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(`Runtime preferences request failed (${response.status})`);
  }

  return response.json() as Promise<{
    currentModel: string | null;
    modelSource?: string;
    currentThinkingMode: string;
    maxThinkingTokens: number | null;
  }>;
}

export type ClaudeContextUsageResponse = {
  configured: boolean;
  model: string | null;
  usedTokens: number;
  contextWindow: number | null;
  percentage: number | null;
};

export async function fetchClaudeRuntimeContextUsage(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const url = new URL('/v1/runtime/claude/context', options.hostUrl);
  url.searchParams.set('sessionScope', 'project');
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Runtime context request failed (${response.status})`);
  }

  return response.json() as Promise<ClaudeContextUsageResponse>;
}

export type CodexContextUsageResponse = {
  configured: boolean;
  model: string | null;
  usedTokens: number;
  contextWindow: number | null;
  percentage: number | null;
};

export async function fetchCodexRuntimeContextUsage(
  options: Options,
  payload?: { threadId?: string }
) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }

  const response = await fetch(
    new URL('/v1/runtime/codex/context', options.hostUrl).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cliPath: options.openaiCodexCliPath,
        envVars: options.openaiEnvVars,
        threadId: payload?.threadId,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Runtime context request failed (${response.status})`);
  }

  return response.json() as Promise<CodexContextUsageResponse>;
}

export async function fetchHostHealth(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(new URL('/v1/health', options.hostUrl).toString());
  if (!response.ok) {
    throw new Error(`Host health request failed (${response.status})`);
  }
  return response.json() as Promise<{ status: string }>;
}
```

Create `src/iso/messaging/httpTransport.ts`:

```ts
import type { Options } from '../../types';
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
} from '../api/httpClient';

export function httpTransport(options: Options) {
  return {
    createJob: (payload: Parameters<typeof httpCreateJob>[1], request?: Parameters<typeof httpCreateJob>[2]) =>
      httpCreateJob(options, payload, request),
    streamJobEvents: (
      jobId: string,
      onEvent: Parameters<typeof httpStreamJobEvents>[2],
      request?: Parameters<typeof httpStreamJobEvents>[3]
    ) => httpStreamJobEvents(options, jobId, onEvent, request),
    respondToJobRequest: (
      jobId: string,
      payload: Parameters<typeof httpRespondToJobRequest>[2],
      request?: Parameters<typeof httpRespondToJobRequest>[3]
    ) => httpRespondToJobRequest(options, jobId, payload, request),
    fetchClaudeRuntimeMetadata: () => httpFetchClaudeRuntimeMetadata(options),
    fetchCodexRuntimeMetadata: () => httpFetchCodexRuntimeMetadata(options),
    fetchHostToolsStatus: () => httpFetchHostToolsStatus(options),
    setHostToolsEnabled: (enabled: boolean) => httpSetHostToolsEnabled(options, enabled),
    updateClaudeRuntimePreferences: (payload: Parameters<typeof httpUpdateClaudeRuntimePreferences>[1]) =>
      httpUpdateClaudeRuntimePreferences(options, payload),
    fetchClaudeRuntimeContextUsage: () => httpFetchClaudeRuntimeContextUsage(options),
    fetchCodexRuntimeContextUsage: (payload?: Parameters<typeof httpFetchCodexRuntimeContextUsage>[1]) =>
      httpFetchCodexRuntimeContextUsage(options, payload),
    fetchHostHealth: () => httpFetchHostHealth(options),
  };
}
```

Create `src/iso/messaging/nativeTransport.ts`:

```ts
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
    async fetchCodexRuntimeMetadata(payload: { cliPath?: string; envVars?: string }) {
      const response = await sendNativeRequest({
        id: crypto.randomUUID(),
        kind: 'request',
        request: { method: 'POST', path: '/v1/runtime/codex/metadata', body: payload },
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
    async updateClaudeRuntimePreferences(payload: { model?: string | null; thinkingMode?: string | null }) {
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
```

Create `src/iso/messaging/transport.ts`:

```ts
import type { Options } from '../../types';
import { httpTransport } from './httpTransport';
import { nativeTransport } from './nativeTransport';

export type TransportKind = 'http' | 'native';

export function createTransport(options: Options) {
  const kind = options.transport === 'native' ? 'native' : 'http';
  return kind === 'native' ? nativeTransport(options) : httpTransport(options);
}
```

Update `src/iso/api/client.ts` to re-export transport-backed helpers:

```ts
import { createTransport } from '../messaging/transport';

export async function createJob(options: Options, payload: JobPayload, request?: { signal?: AbortSignal }) {
  return createTransport(options).createJob(payload, request as never);
}

// Repeat for streamJobEvents/respondToJobRequest/etc by delegating to createTransport(options).
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/iso-transport.test.cjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/iso/messaging/httpTransport.ts src/iso/messaging/nativeTransport.ts src/iso/messaging/transport.ts src/iso/api/client.ts test/iso-transport.test.cjs
git commit -m "feat: add HTTP/native transport abstraction"
```

---

### Task 7: Options + UI for transport

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/helper.ts`
- Modify: `src/iso/panel/Panel.tsx`
- Test: `test/options-transport-default.test.cjs`
- Test: `test/options-fields.test.cjs`

**Step 1: Write the failing tests**

`test/options-transport-default.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('options helper defines transport defaults', () => {
  const helperPath = path.join(__dirname, '..', 'src', 'utils', 'helper.ts');
  const contents = fs.readFileSync(helperPath, 'utf8');

  assert.match(contents, /transport/);
  assert.match(contents, /http/);
});
```

Update `test/options-fields.test.cjs` to assert the new UI field:

```js
assert.match(contents, /ageaf-transport-mode/);
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/options-transport-default.test.cjs`
Expected: FAIL (no transport default).

**Step 3: Write minimal implementation**

Update `src/types.ts`:

```ts
export interface Options {
  transport?: 'http' | 'native';
  // existing fields...
}
```

Update `src/utils/helper.ts`:

```ts
if (options.transport !== 'http' && options.transport !== 'native') {
  options.transport = 'http';
}
```

Update `src/iso/panel/Panel.tsx` connection settings UI:

```tsx
<label class="ageaf-settings__label" for="ageaf-transport-mode">
  Transport
</label>
<select
  id="ageaf-transport-mode"
  class="ageaf-settings__input"
  value={settings.transport ?? 'http'}
  onChange={(event) =>
    updateSettings({ transport: (event.currentTarget as HTMLSelectElement).value as Options['transport'] })
  }
>
  <option value="http">HTTP (dev)</option>
  <option value="native">Native Messaging (prod)</option>
</select>

{settings.transport !== 'native' ? (
  <>
    <label class="ageaf-settings__label" for="ageaf-host-url">Host URL</label>
    <input ... />
  </>
) : (
  <p class="ageaf-settings__hint">Native messaging uses the installed companion app.</p>
)}
```

Keep host availability UI out of this task; add it in Task 9 so Task 7 stays focused on options + toggling between HTTP and Native.

**Step 4: Run tests to verify they pass**

Run: `npm test -- test/options-transport-default.test.cjs`
Expected: PASS.

Run: `npm test -- test/options-fields.test.cjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/types.ts src/utils/helper.ts src/iso/panel/Panel.tsx test/options-transport-default.test.cjs test/options-fields.test.cjs
git commit -m "feat: add transport option and connection UI"
```

---

### Task 8: Manifest permission for native messaging

**Files:**
- Modify: `public/manifest.json`
- Test: `test/manifest-native-messaging.test.cjs`

**Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('manifest requests nativeMessaging permission', () => {
  const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.ok(manifest.permissions.includes('nativeMessaging'));
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/manifest-native-messaging.test.cjs`
Expected: FAIL because permission is missing.

**Step 3: Write minimal implementation**

Update `public/manifest.json`:

```json
"permissions": [
  "storage",
  "nativeMessaging"
]
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/manifest-native-messaging.test.cjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add public/manifest.json test/manifest-native-messaging.test.cjs
git commit -m "feat: request nativeMessaging permission"
```

---

### Task 9: Extension-side availability UX + native ping

**Files:**
- Modify: `src/iso/api/client.ts`
- Modify: `src/iso/panel/Panel.tsx`
- Test: `test/panel-native-status.test.cjs`

**Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('panel shows native host status UI', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /Native host status/);
  assert.match(contents, /Retry/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/panel-native-status.test.cjs`
Expected: FAIL (strings missing).

**Step 3: Write minimal implementation**

Add a helper in `src/iso/api/httpClient.ts` (if you didn’t already add it in Task 6 while extracting HTTP code):

```ts
export async function fetchHostHealth(options: Options) {
  if (!options.hostUrl) {
    throw new Error('Host URL not configured');
  }
  const response = await fetch(new URL('/v1/health', options.hostUrl).toString());
  if (!response.ok) {
    throw new Error(`Host health request failed (${response.status})`);
  }
  return response.json() as Promise<{ status: string }>;
}
```

Update transport types to include `fetchHostHealth` (HTTP uses GET `/v1/health`, native uses same request), then add a tiny wrapper in `src/iso/api/client.ts`:

```ts
export async function fetchHostHealth(options: Options) {
  return createTransport(options).fetchHostHealth();
}
```

Update `src/iso/panel/Panel.tsx` connection tab:

```tsx
const [nativeStatus, setNativeStatus] = useState<'unknown' | 'available' | 'unavailable'>('unknown');

async function checkNativeHost() {
  try {
    await fetchHostHealth(settings);
    setNativeStatus('available');
  } catch {
    setNativeStatus('unavailable');
  }
}

{settings.transport === 'native' ? (
  <>
    <p class="ageaf-settings__hint">Native host status: {nativeStatus}</p>
    <button type="button" class="ageaf-settings__button" onClick={checkNativeHost}>
      Retry
    </button>
  </>
) : null}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/panel-native-status.test.cjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/iso/api/client.ts src/iso/panel/Panel.tsx test/panel-native-status.test.cjs
git commit -m "feat: add native host status UI"
```

---

### Task 10: Packaging + installer scaffolding (macOS)

**Files:**
- Create: `host/scripts/pkg/build-macos.sh`
- Create: `host/scripts/pkg/postinstall.sh`
- Create: `docs/native-messaging.md`
- Test: `test/native-messaging-docs.test.cjs`

**Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('native messaging docs exist', () => {
  const docPath = path.join(__dirname, '..', 'docs', 'native-messaging.md');
  assert.ok(fs.existsSync(docPath));
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/native-messaging-docs.test.cjs`
Expected: FAIL because docs file is missing.

**Step 3: Write minimal implementation**

Create `host/scripts/pkg/build-macos.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/dist-native"
HOST_OUT="$OUT_DIR/ageaf-host"

mkdir -p "$OUT_DIR"

# Build the host JS
pushd "$ROOT_DIR/host" >/dev/null
npm run build
popd >/dev/null

# Package with pkg (requires pkg installed)
# pkg host/dist/nativeMessaging.js --targets node20-macos-x64 --output "$HOST_OUT"

echo "Built host at $HOST_OUT"
```

Create `host/scripts/pkg/postinstall.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

HOST_PATH="/usr/local/bin/ageaf-host"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/com.ageaf.host.json"

mkdir -p "$MANIFEST_DIR"
node "$(dirname "$0")/../build-native-manifest.mjs" "$AGEAF_EXTENSION_ID" "$HOST_PATH" "$MANIFEST_PATH"
```

Create `docs/native-messaging.md` with steps to build, sign, and install (high-level summary, no secrets).

**Step 4: Run test to verify it passes**

Run: `npm test -- test/native-messaging-docs.test.cjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add host/scripts/pkg/build-macos.sh host/scripts/pkg/postinstall.sh docs/native-messaging.md test/native-messaging-docs.test.cjs
git commit -m "docs: add macOS native messaging packaging scaffolding"
```

---

### Task 11: End-to-end verification checklist (manual)

**Files:**
- None

**Step 1: Build host and extension**

Run: `cd host && npm run build`
Run: `npm run build`
Expected: Both builds succeed without errors.

**Step 2: Install native host manifest**

Run (example):

```bash
node host/scripts/build-native-manifest.mjs <extension-id> <host-binary-path> \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json"
```

Expected: Manifest file is created.

**Step 3: Test native mode in extension**

- Load extension from `build/`.
- Set transport to “Native Messaging (prod)”.
- Click “Retry” in Connection tab.
Expected: “Native host status: available”.

**Step 4: Validate Overleaf job flow**

- Open Overleaf project.
- Send a message.
Expected: Job runs, events stream, and the UI updates normally.

**Step 5: Record outcome**

Note any issues and use @superpowers:systematic-debugging if failures occur.

---

Plan complete.
