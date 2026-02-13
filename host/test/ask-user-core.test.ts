import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import {
  runWithJobContext,
  getCurrentJobId,
  registerJobEmitter,
  unregisterJobEmitter,
  executeAskUser,
  resolveAskUserRequest,
  type EmitEvent,
  type AskUserQuestion,
} from '../src/interactive/askUserCore.js';

const sampleQuestions: AskUserQuestion[] = [
  { id: 'q1', question: 'What venue?' },
  { id: 'q2', question: 'Which year?', options: [{ label: '2025' }, { label: '2026' }] },
];

test('lifecycle: register → execute → resolve → result', async () => {
  const jobId = 'test-lifecycle-' + Date.now();
  const events: Array<{ event: string; data?: unknown }> = [];
  const emit: EmitEvent = (e) => events.push(e);

  registerJobEmitter(jobId, emit);

  let requestId: string | undefined;
  const resultPromise = runWithJobContext(jobId, () => {
    const p = executeAskUser(sampleQuestions);
    // Capture requestId from emitted event
    const lastEvent = events[events.length - 1];
    const data = lastEvent?.data as { requestId?: string } | undefined;
    requestId = data?.requestId;
    return p;
  });

  assert.ok(requestId, 'Should have emitted a tool_call event with requestId');
  assert.ok(requestId!.startsWith('ask-'), 'requestId should start with ask-');

  // Verify emitted event structure
  const toolCallEvent = events[events.length - 1];
  assert.equal(toolCallEvent?.event, 'tool_call');
  const eventData = toolCallEvent?.data as any;
  assert.equal(eventData.kind, 'user_input');
  assert.equal(eventData.method, 'ask_user');

  // Resolve with valid result
  const resolved = resolveAskUserRequest(jobId, requestId!, {
    answers: { q1: { answers: ['NeurIPS'] }, q2: { answers: ['2026'] } },
  });
  assert.equal(resolved, true);

  const result = await resultPromise;
  assert.deepEqual(result.answers.q1, { answers: ['NeurIPS'] });
  assert.deepEqual(result.answers.q2, { answers: ['2026'] });

  unregisterJobEmitter(jobId);
});

test('job-scoped resolution: wrong jobId returns false', async () => {
  const job1 = 'test-wrong-job1-' + Date.now();
  const job2 = 'test-wrong-job2-' + Date.now();
  const events: Array<{ event: string; data?: unknown }> = [];

  registerJobEmitter(job1, (e) => events.push(e));

  let requestId: string | undefined;
  const resultPromise = runWithJobContext(job1, () => {
    const p = executeAskUser(sampleQuestions);
    const data = (events[events.length - 1]?.data as any);
    requestId = data?.requestId;
    return p;
  });

  // Try resolving with wrong jobId
  const wrongResolve = resolveAskUserRequest(job2, requestId!, { answers: {} });
  assert.equal(wrongResolve, false, 'Should reject cross-job resolution');

  // Correct resolve should succeed
  const correctResolve = resolveAskUserRequest(job1, requestId!, { answers: {} });
  assert.equal(correctResolve, true);

  await resultPromise;
  unregisterJobEmitter(job1);
});

test('cross-job isolation: two jobs resolve independently', async () => {
  const job1 = 'test-iso1-' + Date.now();
  const job2 = 'test-iso2-' + Date.now();
  const events1: Array<{ event: string; data?: unknown }> = [];
  const events2: Array<{ event: string; data?: unknown }> = [];

  registerJobEmitter(job1, (e) => events1.push(e));
  registerJobEmitter(job2, (e) => events2.push(e));

  let reqId1: string | undefined;
  const p1 = runWithJobContext(job1, () => {
    const p = executeAskUser([{ id: 'q1', question: 'Q1' }]);
    reqId1 = (events1[events1.length - 1]?.data as any)?.requestId;
    return p;
  });

  let reqId2: string | undefined;
  const p2 = runWithJobContext(job2, () => {
    const p = executeAskUser([{ id: 'q2', question: 'Q2' }]);
    reqId2 = (events2[events2.length - 1]?.data as any)?.requestId;
    return p;
  });

  // Resolve job2 first
  resolveAskUserRequest(job2, reqId2!, { answers: { q2: { answers: ['B'] } } });
  const result2 = await p2;
  assert.deepEqual(result2.answers.q2, { answers: ['B'] });

  // job1 still pending — resolve it now
  resolveAskUserRequest(job1, reqId1!, { answers: { q1: { answers: ['A'] } } });
  const result1 = await p1;
  assert.deepEqual(result1.answers.q1, { answers: ['A'] });

  unregisterJobEmitter(job1);
  unregisterJobEmitter(job2);
});

test('timeout: auto-resolves with empty answers', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });

  const jobId = 'test-timeout-' + Date.now();
  const events: Array<{ event: string; data?: unknown }> = [];

  registerJobEmitter(jobId, (e) => events.push(e));

  const resultPromise = runWithJobContext(jobId, () =>
    executeAskUser(sampleQuestions)
  );

  // Fast-forward past the 5-minute timeout
  mock.timers.tick(5 * 60 * 1000 + 100);

  const result = await resultPromise;
  assert.deepEqual(result, { answers: {} }, 'Timeout should resolve with empty answers');

  unregisterJobEmitter(jobId);
  mock.timers.reset();
});

test('abort: pre-aborted signal resolves immediately', async () => {
  const jobId = 'test-abort-' + Date.now();
  const events: Array<{ event: string; data?: unknown }> = [];

  registerJobEmitter(jobId, (e) => events.push(e));

  const result = await runWithJobContext(jobId, () =>
    executeAskUser(sampleQuestions, AbortSignal.abort())
  );

  assert.deepEqual(result, { answers: {} });
  // No event should have been emitted
  assert.equal(events.length, 0, 'Pre-aborted signal should not emit events');

  unregisterJobEmitter(jobId);
});

test('abort: signal aborted after emission resolves with empty answers', async () => {
  const jobId = 'test-abort-after-' + Date.now();
  const events: Array<{ event: string; data?: unknown }> = [];
  const controller = new AbortController();

  registerJobEmitter(jobId, (e) => events.push(e));

  const resultPromise = runWithJobContext(jobId, () =>
    executeAskUser(sampleQuestions, controller.signal)
  );

  // Event should have been emitted
  assert.equal(events.length, 1);

  // Abort the signal
  controller.abort();

  const result = await resultPromise;
  assert.deepEqual(result, { answers: {} });

  unregisterJobEmitter(jobId);
});

test('unknown requestId: resolveAskUserRequest returns false', () => {
  const result = resolveAskUserRequest('some-job', 'nonexistent-req', { answers: {} });
  assert.equal(result, false);
});

test('cleanup: unregisterJobEmitter resolves orphaned requests', async () => {
  const jobId = 'test-cleanup-' + Date.now();
  const events: Array<{ event: string; data?: unknown }> = [];

  registerJobEmitter(jobId, (e) => events.push(e));

  const resultPromise = runWithJobContext(jobId, () =>
    executeAskUser(sampleQuestions)
  );

  // Unregister without resolving — should auto-resolve orphaned request
  unregisterJobEmitter(jobId);

  const result = await resultPromise;
  assert.deepEqual(result, { answers: {} }, 'Orphaned request should resolve with empty answers');
});

test('missing emitter: executeAskUser throws', async () => {
  const jobId = 'test-no-emitter-' + Date.now();
  // Register context but no emitter
  await assert.rejects(
    () => runWithJobContext(jobId, () => executeAskUser(sampleQuestions)),
    /no emitter registered/
  );
});

test('no ALS context: executeAskUser throws', async () => {
  await assert.rejects(
    () => executeAskUser(sampleQuestions),
    /no active job context/
  );
});

test('ALS context: getCurrentJobId returns correct value', () => {
  const result = runWithJobContext('als-test', () => getCurrentJobId());
  assert.equal(result, 'als-test');
});

test('ALS context: getCurrentJobId returns null outside context', () => {
  assert.equal(getCurrentJobId(), null);
});

test('validateAskUserResult: normalizes malformed payloads', async () => {
  const jobId = 'test-validate-' + Date.now();
  const events: Array<{ event: string; data?: unknown }> = [];

  registerJobEmitter(jobId, (e) => events.push(e));

  // Test with null payload
  let reqId: string | undefined;
  let p = runWithJobContext(jobId, () => {
    const promise = executeAskUser([{ id: 'q1', question: 'Q' }]);
    reqId = (events[events.length - 1]?.data as any)?.requestId;
    return promise;
  });
  resolveAskUserRequest(jobId, reqId!, null);
  let result = await p;
  assert.deepEqual(result, { answers: {} });

  // Test with empty object
  p = runWithJobContext(jobId, () => {
    const promise = executeAskUser([{ id: 'q1', question: 'Q' }]);
    reqId = (events[events.length - 1]?.data as any)?.requestId;
    return promise;
  });
  resolveAskUserRequest(jobId, reqId!, {});
  result = await p;
  assert.deepEqual(result, { answers: {} });

  // Test with bad answers type
  p = runWithJobContext(jobId, () => {
    const promise = executeAskUser([{ id: 'q1', question: 'Q' }]);
    reqId = (events[events.length - 1]?.data as any)?.requestId;
    return promise;
  });
  resolveAskUserRequest(jobId, reqId!, { answers: 'bad' });
  result = await p;
  assert.deepEqual(result, { answers: {} });

  // Test with non-object answer entries
  p = runWithJobContext(jobId, () => {
    const promise = executeAskUser([{ id: 'q1', question: 'Q' }]);
    reqId = (events[events.length - 1]?.data as any)?.requestId;
    return promise;
  });
  resolveAskUserRequest(jobId, reqId!, { answers: { q1: 'not-object' } });
  result = await p;
  assert.deepEqual(result.answers.q1, { answers: [] });

  // Test with non-string array entries
  p = runWithJobContext(jobId, () => {
    const promise = executeAskUser([{ id: 'q1', question: 'Q' }]);
    reqId = (events[events.length - 1]?.data as any)?.requestId;
    return promise;
  });
  resolveAskUserRequest(jobId, reqId!, { answers: { q1: { answers: [42, 'ok', null] } } });
  result = await p;
  assert.deepEqual(result.answers.q1, { answers: ['ok'] });

  unregisterJobEmitter(jobId);
});
