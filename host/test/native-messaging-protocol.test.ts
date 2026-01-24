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
