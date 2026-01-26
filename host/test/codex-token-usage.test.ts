import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCodexTokenUsage } from '../src/runtimes/codex/tokenUsage.js';

test('parseCodexTokenUsage clamps usedTokens to contextWindow', () => {
  const parsed = parseCodexTokenUsage({
    tokenUsage: {
      total: { totalTokens: 428000 },
      modelContextWindow: 258000,
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.usedTokens, 258000);
  assert.equal(parsed.contextWindow, 258000);
});

test('parseCodexTokenUsage prefers contextTokens when available', () => {
  const parsed = parseCodexTokenUsage({
    tokenUsage: {
      total: { totalTokens: 428000, contextTokens: 12345 },
      modelContextWindow: 258000,
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.usedTokens, 12345);
  assert.equal(parsed.contextWindow, 258000);
});

