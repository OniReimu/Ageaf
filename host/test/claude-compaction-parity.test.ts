import assert from 'node:assert/strict';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';

type QueryRequest = {
  prompt: unknown;
  options?: Record<string, unknown>;
};

type QueryMessage = Record<string, unknown>;

function asStream(messages: QueryMessage[]): AsyncIterable<QueryMessage> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const message of messages) {
        yield message;
      }
    },
  };
}

function setClaudeEnvForTests() {
  const previous = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    mock: process.env.AGEAF_CLAUDE_MOCK,
    disableDetect: process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT,
  };

  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT = 'true';

  return () => {
    if (previous.apiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previous.apiKey;
    if (previous.mock === undefined) delete process.env.AGEAF_CLAUDE_MOCK;
    else process.env.AGEAF_CLAUDE_MOCK = previous.mock;
    if (previous.disableDetect === undefined) delete process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT;
    else process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT = previous.disableDetect;
  };
}

test('Claude /compact command is sent directly and emits compaction lifecycle', async () => {
  const restoreEnv = setClaudeEnvForTests();
  const calls: QueryRequest[] = [];
  const events: JobEvent[] = [];

  try {
    const {
      setClaudeQueryForTests,
      resetClaudeQueryForTests,
      clearClaudeSessionResumeCacheForTests,
    } = await import('../src/runtimes/claude/agent.js');
    const { runClaudeJob } = await import('../src/runtimes/claude/run.js');

    clearClaudeSessionResumeCacheForTests();
    setClaudeQueryForTests((request: QueryRequest) => {
      calls.push(request);
      return asStream([
        { type: 'system', subtype: 'init', session_id: 'claude-session-compact' },
        { type: 'result', subtype: 'success', result: 'Compacted.', session_id: 'claude-session-compact' },
      ]);
    });

    await runClaudeJob(
      {
        action: 'chat',
        context: { message: '/compact' },
        runtime: { claude: { conversationId: 'conv-compact' } },
      },
      (event) => events.push(event)
    );

    resetClaudeQueryForTests();

    assert.equal(calls.length, 1, 'expected a single Claude query');
    assert.equal(calls[0]?.prompt, '/compact', 'expected direct /compact prompt transport');

    const compactStarts = events.filter(
      (event) => event.event === 'plan' && String((event.data as any)?.phase ?? '') === 'tool_start'
    );
    const compactCompletes = events.filter(
      (event) => event.event === 'plan' && String((event.data as any)?.phase ?? '') === 'compaction_complete'
    );
    assert.ok(compactStarts.length > 0, 'expected compaction tool_start events');
    assert.ok(compactCompletes.length > 0, 'expected compaction_complete events');

    const done = events.find((event) => event.event === 'done');
    assert.ok(done, 'expected done event');
    assert.equal((done?.data as any)?.status, 'ok');
  } finally {
    const {
      resetClaudeQueryForTests,
      clearClaudeSessionResumeCacheForTests,
    } = await import('../src/runtimes/claude/agent.js');
    resetClaudeQueryForTests();
    clearClaudeSessionResumeCacheForTests();
    restoreEnv();
  }
});

test('Claude runtime retries once after overflow by compacting context', async () => {
  const restoreEnv = setClaudeEnvForTests();
  const calls: QueryRequest[] = [];
  const events: JobEvent[] = [];

  try {
    const {
      setClaudeQueryForTests,
      resetClaudeQueryForTests,
      clearClaudeSessionResumeCacheForTests,
    } = await import('../src/runtimes/claude/agent.js');
    const { runClaudeJob } = await import('../src/runtimes/claude/run.js');

    clearClaudeSessionResumeCacheForTests();
    let callIndex = 0;
    setClaudeQueryForTests((request: QueryRequest) => {
      calls.push(request);
      callIndex += 1;

      if (callIndex === 1) {
        return asStream([
          {
            type: 'result',
            subtype: 'context_window_exceeded',
            result: 'Context window exceeded',
            session_id: 'claude-session-overflow',
          },
        ]);
      }
      if (callIndex === 2) {
        assert.equal(request.prompt, '/compact', 'expected second call to be /compact');
        return asStream([
          { type: 'result', subtype: 'success', result: 'Compacted', session_id: 'claude-session-overflow' },
        ]);
      }
      if (callIndex === 3) {
        return asStream([
          {
            type: 'stream_event',
            event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Recovered after compaction' } },
          },
          {
            type: 'result',
            subtype: 'success',
            result: 'Recovered after compaction',
            session_id: 'claude-session-overflow',
          },
        ]);
      }
      throw new Error(`Unexpected query invocation #${callIndex}`);
    });

    await runClaudeJob(
      {
        action: 'chat',
        context: { message: 'Hello' },
        runtime: { claude: { conversationId: 'conv-overflow' } },
      },
      (event) => events.push(event)
    );

    resetClaudeQueryForTests();

    assert.equal(calls.length, 3, 'expected initial call, compact call, and retry call');
    const output = events
      .filter((event) => event.event === 'delta')
      .map((event) => String((event.data as any)?.text ?? ''))
      .join('');
    assert.equal(output, 'Recovered after compaction');

    const doneEvents = events.filter((event) => event.event === 'done');
    assert.equal(doneEvents.length, 1, 'expected one terminal done event');
    assert.equal((doneEvents[0]?.data as any)?.status, 'ok');

    const compactStarts = events.filter(
      (event) => event.event === 'plan' && String((event.data as any)?.phase ?? '') === 'tool_start'
    );
    const compactCompletes = events.filter(
      (event) => event.event === 'plan' && String((event.data as any)?.phase ?? '') === 'compaction_complete'
    );
    assert.ok(compactStarts.length > 0, 'expected compaction start event');
    assert.ok(compactCompletes.length > 0, 'expected compaction completion event');
  } finally {
    const {
      resetClaudeQueryForTests,
      clearClaudeSessionResumeCacheForTests,
    } = await import('../src/runtimes/claude/agent.js');
    resetClaudeQueryForTests();
    clearClaudeSessionResumeCacheForTests();
    restoreEnv();
  }
});

test('Claude runtime persists session_id and uses resume on subsequent turn', async () => {
  const restoreEnv = setClaudeEnvForTests();
  const calls: QueryRequest[] = [];

  try {
    const {
      runClaudeText,
      setClaudeQueryForTests,
      resetClaudeQueryForTests,
      clearClaudeSessionResumeCacheForTests,
    } = await import('../src/runtimes/claude/agent.js');

    clearClaudeSessionResumeCacheForTests();
    setClaudeQueryForTests((request: QueryRequest) => {
      calls.push(request);
      if (calls.length === 1) {
        return asStream([
          { type: 'system', subtype: 'init', session_id: 'claude-session-resume-1' },
          { type: 'result', subtype: 'success', result: 'First turn ok', session_id: 'claude-session-resume-1' },
        ]);
      }
      return asStream([{ type: 'result', subtype: 'success', result: 'Second turn ok' }]);
    });

    await runClaudeText({
      prompt: 'First turn',
      emitEvent: () => undefined,
      runtime: { conversationId: 'conv-resume' },
    });
    await runClaudeText({
      prompt: 'Second turn',
      emitEvent: () => undefined,
      runtime: { conversationId: 'conv-resume' },
    });

    resetClaudeQueryForTests();

    assert.equal(calls.length, 2, 'expected two query calls');
    assert.equal(
      calls[1]?.options?.resume,
      'claude-session-resume-1',
      'expected second call to resume previous SDK session id'
    );
  } finally {
    const {
      resetClaudeQueryForTests,
      clearClaudeSessionResumeCacheForTests,
    } = await import('../src/runtimes/claude/agent.js');
    resetClaudeQueryForTests();
    clearClaudeSessionResumeCacheForTests();
    restoreEnv();
  }
});
