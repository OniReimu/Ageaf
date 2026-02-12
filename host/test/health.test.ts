import assert from 'node:assert/strict';
import test from 'node:test';

test('GET /v1/health returns ok', async () => {
  process.env.AGEAF_START_SERVER = 'false';
  const { buildServer } = await import('../src/server.js');

  const server = buildServer();
  await server.listen({ port: 0, host: '127.0.0.1' });

  try {
    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server did not bind to a port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.ok(body.claude);

    // startedAt should be a valid ISO timestamp (for host restart detection)
    assert.ok(typeof body.startedAt === 'string', 'startedAt should be a string');
    const parsed = Date.parse(body.startedAt);
    assert.ok(!isNaN(parsed), 'startedAt should be a valid ISO date');
  } finally {
    await server.close();
  }
});
