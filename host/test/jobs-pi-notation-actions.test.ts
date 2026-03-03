import assert from 'node:assert/strict';
import test from 'node:test';

import { buildServer } from '../src/server.js';

function parseSSEEvents(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = body.split('\n\n').filter((block) => block.trim());
  for (const block of blocks) {
    const lines = block.split('\n');
    let eventName = '';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) eventName = line.slice(7);
      if (line.startsWith('data: ')) dataStr = line.slice(6);
    }
    if (!eventName || !dataStr) continue;
    try {
      events.push({ event: eventName, data: JSON.parse(dataStr) });
    } catch {
      events.push({ event: eventName, data: dataStr });
    }
  }
  return events;
}

const notationActions = ['notation_check', 'notation_draft_fixes'] as const;

for (const action of notationActions) {
  test(`POST /v1/jobs routes provider=pi action=${action} through notation workflow`, async () => {
    process.env.AGEAF_PI_MOCK = 'true';
    const server = buildServer();

    try {
      const createResponse = await server.inject({
        method: 'POST',
        url: '/v1/jobs',
        payload: {
          provider: 'pi',
          action,
          context: {
            message: 'Run notation pass',
            attachments: [
              {
                path: 'main.tex',
                ext: '.tex',
                content: [
                  'A Large Language Model (LLM) can follow instructions.',
                  'The Large Language Model is useful.',
                ].join('\n'),
              },
            ],
          },
        },
      });

      assert.equal(createResponse.statusCode, 200);
      const { jobId } = JSON.parse(createResponse.body) as { jobId: string };
      assert.ok(jobId);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const eventsResponse = await server.inject({
        method: 'GET',
        url: `/v1/jobs/${jobId}/events`,
      });
      assert.equal(eventsResponse.statusCode, 200);
      assert.doesNotMatch(eventsResponse.body, /Unsupported action/);

      const events = parseSSEEvents(eventsResponse.body);
      const doneEvent = events.find((event) => event.event === 'done');
      assert.ok(doneEvent, 'expected done event');
      assert.equal((doneEvent?.data as any)?.status, 'ok');

      const deltaText = events
        .filter((event) => event.event === 'delta')
        .map((event) => String((event.data as any)?.text ?? ''))
        .join('\n');
      assert.match(deltaText, /Generating notation draft fixes\.\.\./);
    } finally {
      await server.close();
      delete process.env.AGEAF_PI_MOCK;
    }
  });
}
