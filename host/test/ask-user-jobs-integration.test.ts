import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runWithJobContext,
  getCurrentJobId,
  registerJobEmitter,
  unregisterJobEmitter,
  executeAskUser,
  resolveAskUserRequest,
  registerActiveCodexJob,
  unregisterActiveCodexJob,
  resolveCodexJobByPid,
  getActiveCodexJobId,
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

// ── Codex active job tracking tests ──

test('active Codex job tracking: PID-based register / resolve / unregister', () => {
  assert.equal(getActiveCodexJobId(), null, 'No active Codex job initially');
  assert.equal(resolveCodexJobByPid(1001), null, 'Unknown PID returns null');

  registerActiveCodexJob(1001, 'codex-job-1');
  assert.equal(resolveCodexJobByPid(1001), 'codex-job-1', 'PID resolves to correct job');
  assert.equal(getActiveCodexJobId(), 'codex-job-1', 'Fallback returns active job');

  registerActiveCodexJob(1002, 'codex-job-2');
  assert.equal(resolveCodexJobByPid(1002), 'codex-job-2', 'Second PID resolves correctly');
  assert.equal(resolveCodexJobByPid(1001), 'codex-job-1', 'First PID still resolves');

  unregisterActiveCodexJob(1002, 'codex-job-2');
  assert.equal(resolveCodexJobByPid(1002), null, 'Unregistered PID returns null');
  assert.equal(getActiveCodexJobId(), 'codex-job-1', 'Remaining job via fallback');

  unregisterActiveCodexJob(1001, 'codex-job-1');
  assert.equal(getActiveCodexJobId(), null, 'No active Codex job after cleanup');
});

// ── Codex /respond: resolves ask_user before native handler ──

test('/respond Codex ask_user: resolves via resolveAskUserRequest', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const { createJobForTest } = await import('../src/routes/jobs.js');

  const server = buildServer();

  try {
    const jobId = createJobForTest('codex');
    const events: Array<{ event: string; data?: unknown }> = [];

    registerJobEmitter(jobId, (e) => events.push(e));

    let requestId: string | undefined;
    const resultPromise = runWithJobContext(jobId, () => {
      const p = executeAskUser(questions);
      requestId = (events[events.length - 1]?.data as any)?.requestId;
      return p;
    });

    assert.ok(requestId, 'Should have emitted tool_call with requestId');

    // Resolve via the /respond endpoint (string requestId → ask_user path)
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

// ── Internal /v1/internal/ask-user endpoint tests ──

test('/internal/ask-user: resolves via PID-correlated active Codex job', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const { createJobForTest } = await import('../src/routes/jobs.js');

  const server = buildServer();
  const fakePid = 99999;

  try {
    const jobId = createJobForTest('codex');
    const events: Array<{ event: string; data?: unknown }> = [];

    registerJobEmitter(jobId, (e) => events.push(e));
    registerActiveCodexJob(fakePid, jobId);

    // Call the internal endpoint with ppid (simulates stdio server callback)
    const responsePromise = server.inject({
      method: 'POST',
      url: '/v1/internal/ask-user',
      payload: { questions, ppid: fakePid },
    });

    // Wait for the tool_call event to be emitted
    await new Promise((r) => setTimeout(r, 50));
    const toolCallEvent = events.find(
      (e) => e.event === 'tool_call' && (e.data as any)?.method === 'ask_user'
    );
    assert.ok(toolCallEvent, 'Should emit tool_call event');

    const requestId = (toolCallEvent!.data as any).requestId;
    assert.ok(requestId, 'tool_call should include requestId');

    // Resolve the pending request
    const resolved = resolveAskUserRequest(jobId, requestId, {
      answers: { q1: { answers: ['ICML'] } },
    });
    assert.equal(resolved, true);

    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepEqual(body.answers.q1, { answers: ['ICML'] });

    unregisterActiveCodexJob(fakePid, jobId);
    unregisterJobEmitter(jobId);
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});

test('/internal/ask-user: unknown ppid with no active job returns 503', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const server = buildServer();

  try {
    // No active Codex job registered — wrong ppid AND no fallback → 503
    const response = await server.inject({
      method: 'POST',
      url: '/v1/internal/ask-user',
      payload: { questions, ppid: 12345 },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), { error: 'no_active_codex_job' });
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});

test('/internal/ask-user: unknown ppid falls back to active job', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const { createJobForTest } = await import('../src/routes/jobs.js');

  const server = buildServer();
  const wrongPpid = 77777;
  const realPid = 88888;

  try {
    const jobId = createJobForTest('codex');
    const events: Array<{ event: string; data?: unknown }> = [];

    registerJobEmitter(jobId, (e) => events.push(e));
    registerActiveCodexJob(realPid, jobId);

    // Send with a ppid that doesn't match the registered PID — should fall back
    const responsePromise = server.inject({
      method: 'POST',
      url: '/v1/internal/ask-user',
      payload: { questions, ppid: wrongPpid },
    });

    await new Promise((r) => setTimeout(r, 50));
    const toolCallEvent = events.find(
      (e) => e.event === 'tool_call' && (e.data as any)?.method === 'ask_user'
    );
    assert.ok(toolCallEvent, 'Should emit tool_call event via fallback');

    const requestId = (toolCallEvent!.data as any).requestId;
    resolveAskUserRequest(jobId, requestId, {
      answers: { q1: { answers: ['NeurIPS'] } },
    });

    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.deepEqual(body.answers.q1, { answers: ['NeurIPS'] });

    unregisterActiveCodexJob(realPid, jobId);
    unregisterJobEmitter(jobId);
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});

test('/internal/ask-user: returns 503 when no active Codex job', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const server = buildServer();

  try {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/internal/ask-user',
      payload: { questions },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), { error: 'no_active_codex_job' });
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});

// ── Concurrent same-PID overlap tests ──

test('same-PID overlap: two jobs on same app-server coexist correctly', () => {
  const pid = 5000;

  registerActiveCodexJob(pid, 'job-a');
  registerActiveCodexJob(pid, 'job-b');

  // Most recent (top of stack) is resolved
  assert.equal(resolveCodexJobByPid(pid), 'job-b', 'Stack top is most recent job');

  // Unregister job-b; job-a should become top
  unregisterActiveCodexJob(pid, 'job-b');
  assert.equal(resolveCodexJobByPid(pid), 'job-a', 'After removing top, previous job surfaces');

  // Unregister job-a; PID should be cleaned up
  unregisterActiveCodexJob(pid, 'job-a');
  assert.equal(resolveCodexJobByPid(pid), null, 'PID removed after last job unregistered');
  assert.equal(getActiveCodexJobId(), null, 'No active jobs remain');
});

test('same-PID overlap: unregistering non-top entry preserves stack order', () => {
  const pid = 5001;

  registerActiveCodexJob(pid, 'job-x');
  registerActiveCodexJob(pid, 'job-y');
  registerActiveCodexJob(pid, 'job-z');

  // Remove middle entry — top should remain
  unregisterActiveCodexJob(pid, 'job-y');
  assert.equal(resolveCodexJobByPid(pid), 'job-z', 'Top unchanged after middle removal');

  // Remove bottom entry — top should remain
  unregisterActiveCodexJob(pid, 'job-x');
  assert.equal(resolveCodexJobByPid(pid), 'job-z', 'Top unchanged after bottom removal');

  // Remove last entry
  unregisterActiveCodexJob(pid, 'job-z');
  assert.equal(resolveCodexJobByPid(pid), null, 'PID cleaned up');
});

test('same-PID overlap: unregistering unknown jobId is a no-op', () => {
  const pid = 5002;

  registerActiveCodexJob(pid, 'real-job');
  unregisterActiveCodexJob(pid, 'nonexistent-job');

  assert.equal(resolveCodexJobByPid(pid), 'real-job', 'Real job unaffected');

  // Clean up
  unregisterActiveCodexJob(pid, 'real-job');
  assert.equal(resolveCodexJobByPid(pid), null, 'Cleaned up');
});

test('same-PID serialized: register/unregister in sequence keeps stack depth ≤ 1', () => {
  const pid = 5003;

  // Simulate the per-PID lock invariant: only one registered job at a time
  registerActiveCodexJob(pid, 'turn-1');
  assert.equal(resolveCodexJobByPid(pid), 'turn-1');
  unregisterActiveCodexJob(pid, 'turn-1');

  registerActiveCodexJob(pid, 'turn-2');
  assert.equal(resolveCodexJobByPid(pid), 'turn-2');
  unregisterActiveCodexJob(pid, 'turn-2');

  assert.equal(resolveCodexJobByPid(pid), null, 'PID cleaned up after serialized turns');
});

test('/internal/ask-user: returns 400 for invalid questions', async () => {
  const previousMock = process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_CLAUDE_MOCK = 'true';
  process.env.AGEAF_START_SERVER = 'false';

  const { buildServer } = await import('../src/server.js');
  const server = buildServer();

  try {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/internal/ask-user',
      payload: { questions: 'not-an-array' },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'invalid_questions' });
  } finally {
    if (previousMock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previousMock;
    await server.close();
  }
});
