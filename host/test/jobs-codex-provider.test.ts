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

function collectDeltaText(sse: string): string {
  const lines = sse.split('\n');
  let currentEvent: string | null = null;
  let combined = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice('event: '.length).trim();
      continue;
    }

    if (currentEvent !== 'delta') continue;
    if (!line.startsWith('data: ')) continue;

    try {
      const payload = JSON.parse(line.slice('data: '.length)) as { text?: unknown };
      if (typeof payload.text === 'string') combined += payload.text;
    } catch {
      // ignore malformed delta payloads
    }
  }

  return combined;
}

test('POST /v1/jobs supports provider=codex', async () => {
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

    const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex');
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

    const timeout = withTimeout(2000);
    try {
      const eventsResponse = await fetch(
        `http://127.0.0.1:${address.port}/v1/jobs/${jobId}/events`,
        { signal: timeout.signal }
      );
      assert.equal(eventsResponse.status, 200);
      const text = await eventsResponse.text();
      assert.match(text, /event: delta/);
      assert.match(collectDeltaText(text), /Hello from /);
      assert.match(text, /Codex/);
      assert.match(text, /event: usage/);
      assert.match(text, /event: done/);
      assert.match(text, /threadId/);
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
