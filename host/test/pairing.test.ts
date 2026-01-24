import assert from 'node:assert/strict';
import test from 'node:test';

test('POST /v1/pair is not available', async () => {
  process.env.AGEAF_START_SERVER = 'false';
  const { buildServer } = await import('../src/server.js');

  const server = buildServer();
  await server.listen({ port: 0, host: '127.0.0.1' });

  try {
    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server did not bind to a port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/pair`, {
      method: 'POST',
    });
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test('POST /v1/jobs without auth returns job id', async () => {
  process.env.AGEAF_START_SERVER = 'false';
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  const { buildServer } = await import('../src/server.js');

  const server = buildServer();
  await server.listen({ port: 0, host: '127.0.0.1' });

  try {
    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server did not bind to a port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.ok(typeof body.jobId === 'string' && body.jobId.length > 0);
  } finally {
    await server.close();
  }
});
