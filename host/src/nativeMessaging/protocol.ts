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
