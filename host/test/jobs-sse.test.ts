import assert from 'node:assert/strict';
import test from 'node:test';

type TimeoutSignal = { signal: AbortSignal; cleanup: () => void };

function withTimeout(ms: number): TimeoutSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

test('POST /v1/jobs returns jobId', async () => {
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

    const timeout = withTimeout(1000);
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'chat' }),
        signal: timeout.signal,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as { jobId: string };
      assert.ok(typeof body.jobId === 'string' && body.jobId.length > 0);
    } finally {
      timeout.cleanup();
    }
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});

test('GET /v1/jobs/:id/events streams plan and done', async () => {
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

    const jobResponse = await fetch(`http://127.0.0.1:${address.port}/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'chat' }),
    });

    assert.equal(jobResponse.status, 200);
    const { jobId } = (await jobResponse.json()) as { jobId: string };

    const timeout = withTimeout(1000);
    try {
      const eventsResponse = await fetch(
        `http://127.0.0.1:${address.port}/v1/jobs/${jobId}/events`,
        {
          signal: timeout.signal,
        }
      );

      assert.equal(eventsResponse.status, 200);
      const text = await eventsResponse.text();
      assert.match(text, /event: plan/);
      assert.match(text, /event: done/);
    } finally {
      timeout.cleanup();
    }
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});
