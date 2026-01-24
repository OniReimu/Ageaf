import assert from 'node:assert/strict';
import test from 'node:test';

const ORIGIN = 'https://www.overleaf.com';

test('OPTIONS /v1/jobs returns CORS headers', async () => {
  process.env.AGEAF_START_SERVER = 'false';
  const { buildServer } = await import('../src/server.js');

  const server = buildServer();
  await server.listen({ port: 0, host: '127.0.0.1' });

  try {
    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server did not bind to a port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/jobs`, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(
      response.headers.get('access-control-allow-methods') ?? '',
      /POST/
    );
    assert.match(
      response.headers.get('access-control-allow-headers') ?? '',
      /content-type/i
    );
  } finally {
    await server.close();
  }
});

test('GET /v1/jobs/:id/events includes CORS headers', async () => {
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat' }),
    });
    const { jobId } = (await jobResponse.json()) as { jobId: string };

    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/jobs/${jobId}/events`,
      {
        headers: { Origin: ORIGIN },
      }
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});
