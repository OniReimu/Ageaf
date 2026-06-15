import type { JobEvent, Patch } from '../types.js';
import { runClaudeText, type ClaudeRuntimeConfig } from '../runtimes/claude/agent.js';
import {
  extractRewriteTextWithFallback,
  buildRewritePrompt,
} from './rewriteExtraction.js';

// Re-export for backwards compatibility (existing test imports)
export { extractRewriteTextWithFallback, buildRewritePrompt, REWRITE_START, REWRITE_END } from './rewriteExtraction.js';

type EmitEvent = (event: JobEvent) => void;

type RewritePayload = {
  context?: {
    selection?: string;
    surroundingBefore?: string;
    surroundingAfter?: string;
  };
  runtime?: { claude?: ClaudeRuntimeConfig };
  userSettings?: {
    enableCommandBlocklist?: boolean;
    blockedCommandsUnix?: string;
  };
};

export async function runRewriteSelection(payload: RewritePayload, emitEvent: EmitEvent) {
  const selection = payload.context?.selection ?? '';
  const patch: Patch = { kind: 'replaceSelection', text: selection };

  const prompt = buildRewritePrompt(payload);
  emitEvent({ event: 'delta', data: { text: 'Preparing rewrite...' } });

  let doneEvent: JobEvent = { event: 'done', data: { status: 'ok' } };
  const wrappedEmit: EmitEvent = (event) => {
    if (event.event === 'done') {
      doneEvent = event;
      return;
    }
    emitEvent(event);
  };

  const { resultText } = await runClaudeText({
    prompt,
    emitEvent: wrappedEmit,
    runtime: payload.runtime?.claude,
    safety: {
      enabled: payload.userSettings?.enableCommandBlocklist ?? false,
      patternsText: payload.userSettings?.blockedCommandsUnix,
    },
  });

  const status = (doneEvent.data as any)?.status;
  if (status && status !== 'ok') {
    emitEvent(doneEvent);
    return;
  }

  // Keep test/dev behavior stable: in mock mode we don't enforce markers and we
  // simply echo the original selection back as the patch.
  if (process.env.AGEAF_CLAUDE_MOCK === 'true') {
    emitEvent({ event: 'patch', data: patch });
    emitEvent(doneEvent);
    return;
  }

  const extracted = extractRewriteTextWithFallback(resultText);
  const rewritten = extracted.text;
  if (!rewritten) {
    emitEvent({
      event: 'done',
      data: { status: 'error', message: 'Rewrite output missing markers' },
    });
    return;
  }
  if (extracted.usedFallback) {
    emitEvent({
      event: 'delta',
      data: { text: 'Warning: rewrite output missing markers; using best-effort extraction.' },
    });
  }
  emitEvent({
    event: 'patch',
    data: { kind: 'replaceSelection', text: rewritten ?? selection },
  });
  emitEvent(doneEvent);
}
