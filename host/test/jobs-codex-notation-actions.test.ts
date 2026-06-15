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

const notationActions = ['notation_check', 'notation_draft_fixes'] as const;

for (const action of notationActions) {
  test(`POST /v1/jobs supports provider=codex action=${action}`, async () => {
    process.env.AGEAF_START_SERVER = 'false';
    const { buildServer } = await import('../src/server.js');

    const server = buildServer();
    await server.listen({ port: 0, host: '127.0.0.1' });

    try {
      const address = server.server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-patch');
      const jobResponse = await fetch(`http://127.0.0.1:${address.port}/v1/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'codex',
          action,
          runtime: { codex: { cliPath, approvalPolicy: 'on-request' } },
          context: { message: 'Run notation pass', selection: 'old' },
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
        assert.doesNotMatch(text, /Unsupported action/);
        assert.match(text, /event: done/);
      } finally {
        timeout.cleanup();
      }
    } finally {
      await resetCodexAppServerForTests();
      await server.close();
    }
  });
}
