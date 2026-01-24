import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';

test('GET /v1/runtime/codex/metadata returns models from Codex CLI', async () => {
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
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/runtime/codex/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliPath, envVars: '' }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { models: Array<{ value: string }> };
    assert.ok(Array.isArray(body.models));
    assert.ok(body.models.some((model) => model.value.includes('gpt')));
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await resetCodexAppServerForTests();
    await server.close();
  }
});

