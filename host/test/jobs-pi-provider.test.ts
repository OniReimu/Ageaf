import assert from 'node:assert/strict';
import test from 'node:test';

import { buildServer } from '../src/server.js';

test('POST /v1/jobs with provider=pi creates a job and returns jobId', async () => {
  process.env.AGEAF_PI_MOCK = 'true';
  const server = buildServer();

  try {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        provider: 'pi',
        action: 'chat',
        context: { message: 'Hello from test' },
        runtime: {
          pi: {
            thinkingLevel: 'off',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(body.jobId, 'response should contain a jobId');
    assert.equal(typeof body.jobId, 'string');
  } finally {
    await server.close();
  }
});

function parseSSEEvents(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = body.split('\n\n').filter((b) => b.trim());
  for (const block of blocks) {
    const lines = block.split('\n');
    let eventName = '';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) eventName = line.slice(7);
      if (line.startsWith('data: ')) dataStr = line.slice(6);
    }
    if (eventName && dataStr) {
      try {
        events.push({ event: eventName, data: JSON.parse(dataStr) });
      } catch {
        events.push({ event: eventName, data: dataStr });
      }
    }
  }
  return events;
}

test('GET /v1/jobs/:id/events returns SSE stream with plan, delta, and done events for pi job', async () => {
  process.env.AGEAF_PI_MOCK = 'true';
  const server = buildServer();

  try {
    // Create a job
    const createRes = await server.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        provider: 'pi',
        action: 'chat',
        context: { message: 'Hello' },
        runtime: {
          pi: {
            thinkingLevel: 'off',
          },
        },
      },
    });

    const { jobId } = JSON.parse(createRes.body);
    assert.ok(jobId);

    // Wait for mock job to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Fetch events
    const eventsRes = await server.inject({
      method: 'GET',
      url: `/v1/jobs/${jobId}/events`,
    });

    assert.equal(eventsRes.statusCode, 200);

    // Parse SSE events from response body
    const events = parseSSEEvents(eventsRes.body);

    // Validate event types present
    const eventTypes = events.map((e) => e.event);
    assert.ok(eventTypes.includes('plan'), 'should contain a plan event');
    assert.ok(eventTypes.includes('delta'), 'should contain at least one delta event');
    assert.ok(eventTypes.includes('done'), 'should contain a done event');

    // Validate event order: plan should come before delta, delta before done
    const planIdx = eventTypes.indexOf('plan');
    const firstDeltaIdx = eventTypes.indexOf('delta');
    const doneIdx = eventTypes.lastIndexOf('done');
    assert.ok(planIdx < firstDeltaIdx, 'plan should come before first delta');
    assert.ok(firstDeltaIdx < doneIdx, 'first delta should come before done');

    // Validate done event payload
    const doneEvent = events.find((e) => e.event === 'done');
    assert.equal((doneEvent!.data as any).status, 'ok', 'done status should be ok');

    // Validate delta event has text
    const deltaEvent = events.find((e) => e.event === 'delta');
    assert.ok((deltaEvent!.data as any).text, 'delta event should have text');
  } finally {
    await server.close();
  }
});
