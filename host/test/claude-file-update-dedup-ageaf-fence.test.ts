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

/**
 * When the LLM response contains BOTH AGEAF_FILE_UPDATE markers (processed
 * during streaming via stream_event deltas) AND ageaf-patch fences for the
 * same file, the agent must NOT emit duplicates from the ageaf-patch fences.
 */
test('Claude agent skips ageaf-patch fences when FILE_UPDATE patches were already streamed', async () => {
  const restoreEnv = setClaudeEnvForTests();
  const events: JobEvent[] = [];

  const originalBib = [
    '@article{foo2023,',
    '  title={Some Paper},',
    '  year={2023},',
    '}',
    '',
  ].join('\n');

  const updatedBib = [
    '@article{foo2023,',
    '  title={Some Paper},',
    '  year={2025},',
    '}',
    '',
  ].join('\n');

  const patchJson = JSON.stringify({
    kind: 'replaceRangeInFile',
    filePath: 'references.bib',
    expectedOldText: '  year={2023},\n',
    text: '  year={2025},\n',
  });

  // Full response text containing BOTH ageaf-patch fence AND FILE_UPDATE block
  const fullResponseText = [
    'I updated the year.\n',
    '```ageaf-patch',
    patchJson,
    '```',
    '',
    '<<<AGEAF_FILE_UPDATE path="references.bib">>>',
    updatedBib.trimEnd(),
    '<<<AGEAF_FILE_UPDATE_END>>>',
  ].join('\n');

  const overleafMessage = [
    'Check references.',
    '',
    '[Overleaf file: references.bib]',
    '```bibtex',
    originalBib.trimEnd(),
    '```',
    '',
  ].join('\n');

  try {
    const {
      runClaudeText,
      setClaudeQueryForTests,
      resetClaudeQueryForTests,
      clearClaudeSessionResumeCacheForTests,
    } = await import('../src/runtimes/claude/agent.js');

    clearClaudeSessionResumeCacheForTests();

    setClaudeQueryForTests((_request: QueryRequest) => {
      // Use stream_event messages (content_block_delta with text_delta) to
      // exercise the real streaming path → emitVisibleDelta → extractAndEmitCompletedBlocks.
      // Split the response into chunks so the FILE_UPDATE block arrives during streaming.
      const preamble = 'I updated the year.\n\n```ageaf-patch\n' + patchJson + '\n```\n\n';
      const fileUpdateOpen = '<<<AGEAF_FILE_UPDATE path="references.bib">>>\n';
      const fileUpdateBody = updatedBib;
      const fileUpdateClose = '<<<AGEAF_FILE_UPDATE_END>>>\n';

      return asStream([
        // Start a text content block
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        // Stream the preamble (contains ageaf-patch fence)
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: preamble },
          },
        },
        // Stream the FILE_UPDATE open marker
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: fileUpdateOpen },
          },
        },
        // Stream the FILE_UPDATE body
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: fileUpdateBody },
          },
        },
        // Stream the FILE_UPDATE close marker
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: fileUpdateClose },
          },
        },
        // Result with the full text
        {
          type: 'result',
          subtype: 'success',
          result: fullResponseText,
          session_id: 'claude-session-dedup-test',
        },
      ]);
    });

    await runClaudeText({
      prompt: overleafMessage,
      emitEvent: (event) => events.push(event),
      runtime: { conversationId: 'conv-dedup-test' },
      overleafMessage,
    });

    resetClaudeQueryForTests();

    const patchEvents = events.filter((event) => event.event === 'patch');

    // Should get patches, but NOT duplicates
    assert.ok(patchEvents.length > 0, 'expected at least one patch event');

    // Count patches for the year change specifically
    const yearPatches = patchEvents.filter((event) => {
      const data = event.data as any;
      return data?.text?.includes('year={2025}');
    });

    assert.equal(
      yearPatches.length,
      1,
      `expected exactly 1 year={2025} patch but got ${yearPatches.length}: ` +
      JSON.stringify(yearPatches.map((e) => e.data), null, 2)
    );

    // The single patch should come from the FILE_UPDATE streaming path
    // (which includes from/to offsets), not the ageaf-patch fence path
    const yearPatch = yearPatches[0]?.data as any;
    assert.equal(yearPatch.kind, 'replaceRangeInFile');
    assert.equal(yearPatch.filePath, 'references.bib');
    assert.equal(typeof yearPatch.from, 'number', 'patch from FILE_UPDATE should have from offset');
    assert.equal(typeof yearPatch.to, 'number', 'patch from FILE_UPDATE should have to offset');
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

/**
 * Path canonicalization: ageaf-patch fence uses "./references.bib" while the
 * [Overleaf file:] block uses "references.bib". Dedup must still match them.
 */
test('Claude agent dedup works when fence path has ./ prefix vs canonical path', async () => {
  const restoreEnv = setClaudeEnvForTests();
  const events: JobEvent[] = [];

  const originalBib = '@article{foo2023,\n  year={2023},\n}\n';
  const updatedBib = '@article{foo2023,\n  year={2025},\n}\n';

  // ageaf-patch fence uses "./references.bib" — note the ./ prefix
  const patchJson = JSON.stringify({
    kind: 'replaceRangeInFile',
    filePath: './references.bib',
    expectedOldText: '  year={2023},\n',
    text: '  year={2025},\n',
  });

  const fullResponseText = [
    'Updated.\n',
    '```ageaf-patch',
    patchJson,
    '```',
    '',
    '<<<AGEAF_FILE_UPDATE path="references.bib">>>',
    updatedBib.trimEnd(),
    '<<<AGEAF_FILE_UPDATE_END>>>',
  ].join('\n');

  const overleafMessage = [
    'Check references.',
    '',
    '[Overleaf file: references.bib]',
    '```bibtex',
    originalBib.trimEnd(),
    '```',
    '',
  ].join('\n');

  try {
    const {
      runClaudeText,
      setClaudeQueryForTests,
      resetClaudeQueryForTests,
      clearClaudeSessionResumeCacheForTests,
    } = await import('../src/runtimes/claude/agent.js');

    clearClaudeSessionResumeCacheForTests();

    setClaudeQueryForTests(() => {
      const preamble = 'Updated.\n\n```ageaf-patch\n' + patchJson + '\n```\n\n';
      const fileUpdateOpen = '<<<AGEAF_FILE_UPDATE path="references.bib">>>\n';
      const fileUpdateBody = updatedBib;
      const fileUpdateClose = '<<<AGEAF_FILE_UPDATE_END>>>\n';

      return asStream([
        { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: preamble } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: fileUpdateOpen } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: fileUpdateBody } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: fileUpdateClose } } },
        { type: 'result', subtype: 'success', result: fullResponseText, session_id: 'claude-session-path-test' },
      ]);
    });

    await runClaudeText({
      prompt: overleafMessage,
      emitEvent: (event) => events.push(event),
      runtime: { conversationId: 'conv-path-dedup-test' },
      overleafMessage,
    });

    resetClaudeQueryForTests();

    const yearPatches = events
      .filter((e) => e.event === 'patch')
      .filter((e) => (e.data as any)?.text?.includes('year={2025}'));

    assert.equal(
      yearPatches.length,
      1,
      `expected 1 year patch despite ./references.bib vs references.bib, got ${yearPatches.length}`
    );
  } finally {
    const { resetClaudeQueryForTests, clearClaudeSessionResumeCacheForTests } = await import('../src/runtimes/claude/agent.js');
    resetClaudeQueryForTests();
    clearClaudeSessionResumeCacheForTests();
    restoreEnv();
  }
});
