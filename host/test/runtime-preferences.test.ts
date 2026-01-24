import assert from 'node:assert/strict';
import test from 'node:test';

test('POST /v1/runtime/claude/preferences updates model and thinking mode', async () => {
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

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/runtime/claude/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', thinkingMode: 'high' }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      currentModel: string | null;
      currentThinkingMode: string;
    };

    assert.equal(body.currentModel, 'claude-sonnet-4-5');
    assert.equal(body.currentThinkingMode, 'high');
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});
