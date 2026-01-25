import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';

type TimeoutSignal = { signal: AbortSignal; cleanup: () => void };

function withTimeout(ms: number): TimeoutSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

type ParsedEvent = { event: string; data: any };

function parseSseBlock(block: string): ParsedEvent | null {
  const lines = block.split('\n');
  let event = '';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    }
    if (line.startsWith('data:')) {
      data += line.slice('data:'.length).trim();
    }
  }
  if (!event || !data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data };
  }
}

test('Codex approval requests can be responded to', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';
  const { buildServer } = await import('../src/server.js');

  const server = buildServer();
  await server.listen({ port: 0, host: '127.0.0.1' });

  try {
    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server did not bind to a port');
    }

    const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-approval');
    const jobResponse = await fetch(`http://127.0.0.1:${address.port}/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'codex',
        action: 'chat',
        runtime: { codex: { cliPath, approvalPolicy: 'on-request' } },
        context: { message: 'Hello' },
      }),
    });

    assert.equal(jobResponse.status, 200);
    const { jobId } = (await jobResponse.json()) as { jobId: string };
    assert.ok(jobId);

    const timeout = withTimeout(5000);
    try {
      const eventsResponse = await fetch(
        `http://127.0.0.1:${address.port}/v1/jobs/${jobId}/events`,
        { signal: timeout.signal }
      );
      assert.equal(eventsResponse.status, 200);
      assert.ok(eventsResponse.body);

      const reader = eventsResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let approvalRequestId: number | string | null = null;
      let sawDelta = false;
      let sawDone = false;

      while (!sawDone) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf('\n\n');
        while (idx >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const parsed = parseSseBlock(chunk);
          if (!parsed) {
            idx = buffer.indexOf('\n\n');
            continue;
          }

          if (parsed.event === 'tool_call' && parsed.data?.requestId != null) {
            approvalRequestId = parsed.data.requestId;
            const respondResponse: globalThis.Response = await fetch(
              `http://127.0.0.1:${address.port}/v1/jobs/${jobId}/respond`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ requestId: approvalRequestId, result: 'accept' }),
                signal: timeout.signal,
              }
            );
            assert.equal(respondResponse.status, 200);
          }

          if (parsed.event === 'delta') {
            sawDelta = true;
          }

          if (parsed.event === 'done') {
            sawDone = true;
          }

          idx = buffer.indexOf('\n\n');
        }
      }

      assert.ok(approvalRequestId != null, 'expected an approval requestId');
      assert.ok(sawDelta, 'expected delta after approval');
      assert.ok(sawDone, 'expected done');
    } finally {
      timeout.cleanup();
    }
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await resetCodexAppServerForTests();
    await server.close();
  }
});

