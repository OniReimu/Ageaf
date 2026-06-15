import assert from 'node:assert/strict';
import test from 'node:test';

test('Pi runtime mock mode emits delta + done events', async () => {
  process.env.AGEAF_PI_MOCK = 'true';

  // Dynamic import so env var is active
  const { runPiJob } = await import('../src/runtimes/pi/run.js');

  const events: Array<{ event: string; data?: unknown }> = [];
  const emitEvent = (jobEvent: { event: string; data?: unknown }) => {
    events.push(jobEvent);
  };

  await runPiJob(
    {
      provider: 'pi',
      action: 'chat',
      context: { message: 'Hello' },
    } as any,
    emitEvent as any
  );

  // Should have at least one delta and a done event
  const deltaEvents = events.filter((e) => e.event === 'delta');
  const doneEvents = events.filter((e) => e.event === 'done');

  assert.ok(deltaEvents.length > 0, 'should emit at least one delta event');
  assert.equal(doneEvents.length, 1, 'should emit exactly one done event');
  assert.equal((doneEvents[0]!.data as any).status, 'ok', 'done status should be ok');

  delete process.env.AGEAF_PI_MOCK;
});

test('Pi runtime rewrite action in mock mode emits replaceSelection', async () => {
  process.env.AGEAF_PI_MOCK = 'true';

  const { runPiJob } = await import('../src/runtimes/pi/run.js');

  const events: Array<{ event: string; data?: unknown }> = [];
  const emitEvent = (jobEvent: { event: string; data?: unknown }) => {
    events.push(jobEvent);
  };

  await runPiJob(
    {
      provider: 'pi',
      action: 'rewrite',
      context: {
        selection: 'original text',
        surroundingBefore: 'before',
        surroundingAfter: 'after',
      },
    } as any,
    emitEvent as any
  );

  const doneEvents = events.filter((e) => e.event === 'done');
  assert.equal(doneEvents.length, 1, 'should emit a done event');
  assert.equal((doneEvents[0]!.data as any).status, 'ok');

  // Should also emit a replaceSelection patch
  const patchEvents = events.filter((e) => e.event === 'patch');
  assert.ok(patchEvents.length > 0, 'should emit a patch event');
  assert.equal((patchEvents[0]!.data as any).kind, 'replaceSelection');

  delete process.env.AGEAF_PI_MOCK;
});
