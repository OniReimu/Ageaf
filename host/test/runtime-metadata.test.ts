import assert from 'node:assert/strict';
import test from 'node:test';

test('GET /v1/runtime/claude/metadata returns models and thinking modes', async () => {
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

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/runtime/claude/metadata`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      models: Array<{ value: string; displayName: string; description: string }>;
      thinkingModes: Array<{ id: string; label: string; maxThinkingTokens: number | null }>;
      currentThinkingMode: string;
      currentModel: string | null;
    };

    assert.ok(Array.isArray(body.models));
    assert.ok(body.models.length > 0);
    assert.deepEqual(
      body.models.map((model) => model.displayName),
      ['Sonnet', 'Opus', 'Haiku']
    );
    assert.deepEqual(
      body.models.map((model) => model.description),
      [
        'Best for everyday task',
        'Most capable for complex work',
        'Fastest for quick answers',
      ]
    );
    assert.ok(Array.isArray(body.thinkingModes));
    assert.ok(body.thinkingModes.length > 0);
    assert.ok(typeof body.currentThinkingMode === 'string');
    assert.ok(body.currentModel);
    assert.match(body.currentModel ?? '', /sonnet/i);
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});
