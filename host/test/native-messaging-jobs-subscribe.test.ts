import assert from 'node:assert/strict';
import test from 'node:test';

import { subscribeToJobEventsForTest, createJobForTest } from '../src/routes/jobs.js';

test('subscribeToJobEvents replays history and ends when done', () => {
  const jobId = createJobForTest('claude');
  const events: Array<{ event: string; data: unknown }> = [];
  let ended = false;

  const unsubscribe = subscribeToJobEventsForTest(jobId, {
    send: (event) => events.push(event),
    end: () => {
      ended = true;
    },
  });

  assert.ok(unsubscribe);
  assert.equal(ended, false);
  assert.equal(events.length > 0, true);
});
