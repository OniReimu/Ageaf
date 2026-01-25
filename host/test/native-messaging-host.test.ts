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
  // Note: Run with AGEAF_START_SERVER=false to prevent auto-start
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
