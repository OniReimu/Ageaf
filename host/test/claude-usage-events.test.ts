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

test('Claude runtime emits usage when result has usage but no modelUsage', async () => {
  const restoreEnv = setClaudeEnvForTests();
  const calls: QueryRequest[] = [];
  const events: JobEvent[] = [];

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
      return asStream([
        {
          type: 'result',
          subtype: 'success',
          result: 'Usage-only shape',
          usage: {
            input_tokens: 120,
            output_tokens: 40,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 10,
          },
          session_id: 'claude-session-usage-shape',
        },
      ]);
    });

    await runClaudeText({
      prompt: 'hello',
      emitEvent: (event) => events.push(event),
      runtime: { conversationId: 'conv-usage-shape' },
    });

    resetClaudeQueryForTests();

    assert.equal(calls.length, 1, 'expected one query call');

    const usage = events.find((event) => event.event === 'usage');
    assert.ok(usage, 'expected usage event from usage-only result shape');
    assert.equal((usage?.data as any)?.usedTokens, 190);
    assert.equal((usage?.data as any)?.contextWindow, null);
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
