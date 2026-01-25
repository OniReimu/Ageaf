import assert from 'node:assert/strict';
import test from 'node:test';

import {
  subscribeToJobEventsForTest,
  createJobForTest,
  createDoneJobForTest,
} from '../src/routes/jobs.js';

test('subscribeToJobEvents replays history for active jobs', () => {
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

test('subscribeToJobEvents ends immediately for completed jobs', () => {
  const jobId = createDoneJobForTest('claude');
  const events: Array<{ event: string; data: unknown }> = [];
  let ended = false;

  const unsubscribe = subscribeToJobEventsForTest(jobId, {
    send: (event) => events.push(event),
    end: () => {
      ended = true;
    },
  });

  assert.equal(unsubscribe, undefined); // No unsubscribe for done jobs
  assert.equal(ended, true); // Should end immediately
  assert.equal(events.length, 2); // Should have replayed both events
});
