import type { JobEvent, Patch } from '../types.js';
import { runClaudeText, type ClaudeRuntimeConfig } from '../runtimes/claude/agent.js';

type EmitEvent = (event: JobEvent) => void;

type RewritePayload = {
  context?: {
    selection?: string;
    surroundingBefore?: string;
    surroundingAfter?: string;
  };
  runtime?: { claude?: ClaudeRuntimeConfig };
  userSettings?: {
    enableTools?: boolean;
    enableCommandBlocklist?: boolean;
    blockedCommandsUnix?: string;
  };
};

const REWRITE_START = '<<<AGEAF_REWRITE>>>';
const REWRITE_END = '<<<AGEAF_REWRITE_END>>>';

const REWRITE_PROMPT = `Rewrite the selected LaTeX text for clarity and academic tone.
Preserve all LaTeX commands, citations (e.g., \\cite{}), labels (\\label{}), references (\\ref{}), and math.

Output ONLY the rewritten selection between the markers below (no JSON, no Markdown, no explanation):
${REWRITE_START}
... rewritten selection here ...
${REWRITE_END}`;

export function buildRewritePrompt(payload: RewritePayload) {
  const selection = payload.context?.selection ?? '';
  const before = payload.context?.surroundingBefore ?? '';
  const after = payload.context?.surroundingAfter ?? '';

  return [
    REWRITE_PROMPT,
    '\n\nContext before:\n```latex\n',
    before,
    '\n```\n\nSelection:\n```latex\n',
    selection,
    '\n```\n\nContext after:\n```latex\n',
    after,
    '\n```\n',
  ].join('');
}

function extractRewriteText(resultText: string | null) {
  if (!resultText) return null;
  const startIndex = resultText.indexOf(REWRITE_START);
  if (startIndex < 0) return null;
  const endIndex = resultText.indexOf(REWRITE_END, startIndex + REWRITE_START.length);
  if (endIndex < 0) return null;
  const body = resultText.slice(startIndex + REWRITE_START.length, endIndex).trim();
  return body.length > 0 ? body : null;
}

export async function runRewriteSelection(payload: RewritePayload, emitEvent: EmitEvent) {
  const selection = payload.context?.selection ?? '';
  const patch: Patch = {
    kind: 'replaceSelection',
    text: selection,
  };

  const prompt = buildRewritePrompt(payload);
  emitEvent({ event: 'delta', data: { text: 'Preparing rewrite...' } });

  let doneEvent: JobEvent | null = null;
  const wrappedEmit: EmitEvent = (event) => {
    if (event.event === 'done') {
      doneEvent = event;
      return;
    }
    emitEvent(event);
  };

  const resultText = await runClaudeText({
    prompt,
    emitEvent: wrappedEmit,
    runtime: payload.runtime?.claude,
    safety: {
      enabled: payload.userSettings?.enableCommandBlocklist ?? false,
      patternsText: payload.userSettings?.blockedCommandsUnix,
    },
    enableTools: payload.userSettings?.enableTools ?? false,
  });

  const status = (doneEvent as any)?.data?.status;
  if (status && status !== 'ok') {
    emitEvent(doneEvent as JobEvent);
    return;
  }

  const rewritten = extractRewriteText(resultText);
  if (!rewritten && process.env.AGEAF_CLAUDE_MOCK !== 'true') {
    emitEvent({
      event: 'done',
      data: { status: 'error', message: 'Rewrite output missing markers' },
    });
    return;
  }
  emitEvent({
    event: 'patch',
    data: { kind: 'replaceSelection', text: rewritten ?? selection },
  });
  emitEvent(doneEvent ?? { event: 'done', data: { status: 'ok' } });
}
