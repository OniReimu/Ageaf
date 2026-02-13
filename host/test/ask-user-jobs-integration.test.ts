import assert from 'node:assert/strict';
import test from 'node:test';
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

const questions: AskUserQuestion[] = [
  { id: 'q1', question: 'What venue?', options: [{ label: 'NeurIPS' }, { label: 'ICML' }] },
];

// ── Core-level integration tests (no HTTP, no mocking) ──

test('resolve lifecycle: register → execute → capture requestId → resolve', async () => {
  const jobId = 'int-lifecycle-' + Date.now();
  const events: Array<{ event: string; data?: unknown }> = [];
  const emit: EmitEvent = (e) => events.push(e);

  registerJobEmitter(jobId, emit);

  let requestId: string | undefined;
  const resultPromise = runWithJobContext(jobId, () => {
    const p = executeAskUser(questions);
    requestId = (events[events.length - 1]?.data as any)?.requestId;
    return p;
  });

  assert.ok(requestId, 'requestId should be captured from emitted event');

  const resolved = resolveAskUserRequest(jobId, requestId!, {
    answers: { q1: { answers: ['NeurIPS'] } },
  });
  assert.equal(resolved, true, 'resolveAskUserRequest should return true');

  const result = await resultPromise;
  assert.deepEqual(result.answers.q1, { answers: ['NeurIPS'] });

  unregisterJobEmitter(jobId);
});

test('cross-job rejection: resolve with wrong jobId fails', async () => {
  const job1 = 'int-cross1-' + Date.now();
  const job2 = 'int-cross2-' + Date.now();
  const events1: Array<{ event: string; data?: unknown }> = [];
  const events2: Array<{ event: string; data?: unknown }> = [];

  registerJobEmitter(job1, (e) => events1.push(e));
  registerJobEmitter(job2, (e) => events2.push(e));

  let reqId1: string | undefined;
  const p1 = runWithJobContext(job1, () => {
    const p = executeAskUser(questions);
    reqId1 = (events1[events1.length - 1]?.data as any)?.requestId;
    return p;
  });

  // Try resolving job1's request with job2's ID
  const wrongResolve = resolveAskUserRequest(job2, reqId1!, { answers: {} });
  assert.equal(wrongResolve, false, 'Cross-job resolution should fail');

  // Correct resolution
  const correctResolve = resolveAskUserRequest(job1, reqId1!, { answers: { q1: { answers: ['ICML'] } } });
  assert.equal(correctResolve, true);

  const result = await p1;
  assert.deepEqual(result.answers.q1, { answers: ['ICML'] });

  unregisterJobEmitter(job1);
  unregisterJobEmitter(job2);
});

test('ALS propagation: runWithJobContext makes jobId available', () => {
  const result = runWithJobContext('test-als-id', () => getCurrentJobId());
  assert.equal(result, 'test-als-id');
});

test('ALS propagation: getCurrentJobId is null outside context', () => {
  assert.equal(getCurrentJobId(), null);
});

test('pre-aborted signal: resolves immediately without emitting', async () => {
  const jobId = 'int-preabort-' + Date.now();
  const events: Array<{ event: string; data?: unknown }> = [];

  registerJobEmitter(jobId, (e) => events.push(e));

  const result = await runWithJobContext(jobId, () =>
    executeAskUser(questions, AbortSignal.abort())
  );

  assert.deepEqual(result, { answers: {} });
  assert.equal(events.length, 0, 'Pre-aborted signal should not emit events');

  unregisterJobEmitter(jobId);
});

// ── HTTP-level integration tests ──

test('/respond Pi routing: resolves pending request via HTTP', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const { createJobForTest } = await import('../src/routes/jobs.js');

  const server = buildServer();

  try {
    const jobId = createJobForTest('pi');
    const events: Array<{ event: string; data?: unknown }> = [];

    registerJobEmitter(jobId, (e) => events.push(e));

    let requestId: string | undefined;
    const resultPromise = runWithJobContext(jobId, () => {
      const p = executeAskUser(questions);
      requestId = (events[events.length - 1]?.data as any)?.requestId;
      return p;
    });

    assert.ok(requestId);

    const response = await server.inject({
      method: 'POST',
      url: `/v1/jobs/${jobId}/respond`,
      payload: {
        requestId,
        result: { answers: { q1: { answers: ['NeurIPS'] } } },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { ok: true });

    const result = await resultPromise;
    assert.deepEqual(result.answers.q1, { answers: ['NeurIPS'] });

    unregisterJobEmitter(jobId);
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});

test('/respond Codex fallthrough: returns 400 unsupported', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const { createJobForTest } = await import('../src/routes/jobs.js');

  const server = buildServer();

  try {
    const jobId = createJobForTest('codex');

    const response = await server.inject({
      method: 'POST',
      url: `/v1/jobs/${jobId}/respond`,
      payload: { requestId: 'some-req', result: {} },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'unsupported' });
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});

test('/respond wrong jobId: returns 404 no_pending_request', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const { createJobForTest } = await import('../src/routes/jobs.js');

  const server = buildServer();

  try {
    const job1 = createJobForTest('pi');
    const job2 = createJobForTest('pi');
    const events: Array<{ event: string; data?: unknown }> = [];

    registerJobEmitter(job1, (e) => events.push(e));

    let requestId: string | undefined;
    const resultPromise = runWithJobContext(job1, () => {
      const p = executeAskUser(questions);
      requestId = (events[events.length - 1]?.data as any)?.requestId;
      return p;
    });

    assert.ok(requestId);

    // POST job1's requestId to job2's endpoint
    const response = await server.inject({
      method: 'POST',
      url: `/v1/jobs/${job2}/respond`,
      payload: { requestId, result: { answers: {} } },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(JSON.parse(response.body), { error: 'no_pending_request' });

    // Clean up — resolve properly
    resolveAskUserRequest(job1, requestId!, { answers: {} });
    await resultPromise;
    unregisterJobEmitter(job1);
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});

test('/respond invalid requestId type: returns 400', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const { createJobForTest } = await import('../src/routes/jobs.js');

  const server = buildServer();

  try {
    const jobId = createJobForTest('pi');

    const response = await server.inject({
      method: 'POST',
      url: `/v1/jobs/${jobId}/respond`,
      payload: { requestId: 123 },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'invalid_requestId' });
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});
