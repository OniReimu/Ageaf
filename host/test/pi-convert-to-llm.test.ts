import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convertToLlmStripSignatures } from '../src/runtimes/pi/agent.js';

// Helpers to build realistic AgentMessage fixtures
function userMsg(text: string) {
  return { role: 'user' as const, content: text, timestamp: Date.now() };
}

function assistantMsg(
  api: string,
  blocks: any[],
  overrides: Record<string, any> = {},
) {
  return {
    role: 'assistant' as const,
    content: blocks,
    api,
    provider: 'openai',
    model: 'gpt-4o',
    usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
    stopReason: 'end_turn',
    timestamp: Date.now(),
    ...overrides,
  };
}

function toolResultMsg(callId: string, text: string) {
  return {
    role: 'toolResult' as const,
    toolCallId: callId,
    toolName: 'test_tool',
    content: [{ type: 'text' as const, text }],
    isError: false,
    timestamp: Date.now(),
  };
}

// ── Multi-turn text-only (no tools) ────────────────────────────

describe('convertToLlmStripSignatures – multi-turn text-only', () => {
  it('strips textSignature from openai-responses assistant messages', () => {
    const messages = [
      userMsg('Hello'),
      assistantMsg('openai-responses', [
        { type: 'text', text: 'Hi there!', textSignature: 'rs_abc123def456' },
      ]),
      userMsg('Follow-up question'),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    assert.equal(result.length, 3);
    const assistant = result[1] as any;
    assert.equal(assistant.role, 'assistant');
    assert.equal(assistant.content[0].text, 'Hi there!');
    assert.equal(assistant.content[0].textSignature, undefined, 'textSignature should be stripped');
  });

  it('strips thinkingSignature from openai-responses assistant messages', () => {
    const messages = [
      userMsg('Think about this'),
      assistantMsg('openai-responses', [
        { type: 'thinking', thinking: 'Let me think...', thinkingSignature: '{"id":"rs_reasoning_001"}' },
        { type: 'text', text: 'Answer', textSignature: 'rs_text_001' },
      ]),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content[0].thinking, 'Let me think...');
    assert.equal(assistant.content[0].thinkingSignature, undefined, 'thinkingSignature should be stripped');
    assert.equal(assistant.content[1].textSignature, undefined, 'textSignature should be stripped');
  });

  it('strips signatures from openai-codex-responses API', () => {
    const messages = [
      userMsg('Hello'),
      assistantMsg('openai-codex-responses', [
        { type: 'text', text: 'Response', textSignature: 'msg_codex_001' },
      ]),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content[0].textSignature, undefined);
  });

  it('preserves signatures for non-store-false APIs (google-generative-ai)', () => {
    const messages = [
      userMsg('Hello'),
      assistantMsg('google-generative-ai', [
        { type: 'text', text: 'Response', textSignature: 'google_sig_001' },
        { type: 'thinking', thinking: 'Deep thought', thinkingSignature: 'google_think_001' },
      ], { provider: 'google' }),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content[0].textSignature, 'google_sig_001', 'should preserve google textSignature');
    assert.equal(assistant.content[1].thinkingSignature, 'google_think_001', 'should preserve google thinkingSignature');
  });

  it('preserves signatures for anthropic-messages API', () => {
    const messages = [
      userMsg('Hello'),
      assistantMsg('anthropic-messages', [
        { type: 'text', text: 'Response', textSignature: 'anthro_sig_001' },
      ], { provider: 'anthropic' }),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content[0].textSignature, 'anthro_sig_001', 'should preserve anthropic textSignature');
  });

  it('preserves signatures for openai-completions API (used by xai/groq/openrouter/etc)', () => {
    const messages = [
      userMsg('Hello'),
      assistantMsg('openai-completions', [
        { type: 'text', text: 'Response', textSignature: 'comp_sig_001' },
        { type: 'toolCall', id: 'call_comp|fc_comp_item', name: 'tool', arguments: {} },
      ], { provider: 'xai' }),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content[0].textSignature, 'comp_sig_001', 'should preserve completions textSignature');
    assert.equal(assistant.content[1].id, 'call_comp|fc_comp_item', 'should preserve completions tool-call ID');
  });

  it('preserves signatures for azure-openai-responses API', () => {
    const messages = [
      userMsg('Hello'),
      assistantMsg('azure-openai-responses', [
        { type: 'text', text: 'Response', textSignature: 'azure_sig_001' },
      ], { provider: 'azure-openai-responses' }),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content[0].textSignature, 'azure_sig_001', 'should preserve azure textSignature');
  });
});

// ── Multi-turn with tool calls ─────────────────────────────────

describe('convertToLlmStripSignatures – multi-turn with tools', () => {
  it('strips tool-call item ID suffix (call_id|item_id → call_id) for openai-responses', () => {
    const messages = [
      userMsg('Draw a diagram'),
      assistantMsg('openai-responses', [
        {
          type: 'toolCall',
          id: 'call_abc123|fc_item_456',
          name: 'render_mermaid',
          arguments: { code: 'graph LR; A-->B' },
        },
      ]),
      toolResultMsg('call_abc123', 'Rendered successfully'),
      assistantMsg('openai-responses', [
        { type: 'text', text: 'Here is the diagram', textSignature: 'rs_final_msg' },
      ]),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    assert.equal(result.length, 4);

    // First assistant: tool call ID should be stripped to call_id only
    const firstAssistant = result[1] as any;
    assert.equal(firstAssistant.content[0].id, 'call_abc123', 'should strip item_id suffix');
    assert.equal(firstAssistant.content[0].name, 'render_mermaid');

    // Second assistant: textSignature stripped
    const secondAssistant = result[3] as any;
    assert.equal(secondAssistant.content[0].textSignature, undefined);
  });

  it('preserves tool-call IDs without pipe separator', () => {
    const messages = [
      userMsg('Do something'),
      assistantMsg('openai-responses', [
        {
          type: 'toolCall',
          id: 'call_simple_no_pipe',
          name: 'some_tool',
          arguments: {},
        },
      ]),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content[0].id, 'call_simple_no_pipe', 'should leave IDs without pipe unchanged');
  });

  it('strips tool-call item ID suffix for openai-codex-responses (parity)', () => {
    const messages = [
      userMsg('Code this'),
      assistantMsg('openai-codex-responses', [
        {
          type: 'toolCall',
          id: 'call_codex_1|fc_codex_item_1',
          name: 'edit_file',
          arguments: { path: 'index.ts' },
        },
      ]),
      toolResultMsg('call_codex_1', 'File edited'),
      assistantMsg('openai-codex-responses', [
        { type: 'text', text: 'Done editing', textSignature: 'rs_codex_final' },
      ]),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const firstAssistant = result[1] as any;
    assert.equal(firstAssistant.content[0].id, 'call_codex_1', 'should strip item_id suffix for codex-responses');

    const secondAssistant = result[3] as any;
    assert.equal(secondAssistant.content[0].textSignature, undefined);
  });

  it('preserves tool-call compound IDs for non-store-false APIs', () => {
    const messages = [
      userMsg('Do something'),
      assistantMsg('anthropic-messages', [
        {
          type: 'toolCall',
          id: 'call_abc|fc_item_xyz',
          name: 'some_tool',
          arguments: {},
        },
      ], { provider: 'anthropic' }),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content[0].id, 'call_abc|fc_item_xyz', 'should preserve compound ID for non-store-false API');
  });

  it('handles mixed content blocks (thinking + tool call + text) in one message', () => {
    const messages = [
      userMsg('Complex request'),
      assistantMsg('openai-responses', [
        { type: 'thinking', thinking: 'Planning...', thinkingSignature: '{"id":"rs_think_mixed"}' },
        { type: 'toolCall', id: 'call_mix|fc_mix_item', name: 'tool_a', arguments: { x: 1 } },
        { type: 'text', text: 'Done', textSignature: 'rs_mix_text' },
      ]),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content.length, 3);
    assert.equal(assistant.content[0].thinkingSignature, undefined, 'thinking signature stripped');
    assert.equal(assistant.content[1].id, 'call_mix', 'tool call item ID stripped');
    assert.equal(assistant.content[2].textSignature, undefined, 'text signature stripped');
  });
});

// ── Edge cases ─────────────────────────────────────────────────

describe('convertToLlmStripSignatures – edge cases', () => {
  it('filters out non-LLM message roles', () => {
    const messages = [
      userMsg('Hello'),
      { role: 'system', content: 'System message', timestamp: Date.now() },
      assistantMsg('openai-responses', [{ type: 'text', text: 'Hi' }]),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    assert.equal(result.length, 2, 'should filter out system messages');
    assert.equal(result[0].role, 'user');
    assert.equal(result[1].role, 'assistant');
  });

  it('handles empty messages array', () => {
    const result = convertToLlmStripSignatures([]);
    assert.equal(result.length, 0);
  });

  it('handles assistant message with no signatures (passthrough)', () => {
    const messages = [
      userMsg('Hello'),
      assistantMsg('openai-responses', [
        { type: 'text', text: 'Clean response' },
      ]),
    ];

    const result = convertToLlmStripSignatures(messages as any);

    const assistant = result[1] as any;
    assert.equal(assistant.content[0].text, 'Clean response');
    assert.equal(assistant.content[0].textSignature, undefined);
  });
});
