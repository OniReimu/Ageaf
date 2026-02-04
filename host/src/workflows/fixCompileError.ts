import type { JobEvent, Patch } from '../types.js';
import { runClaudeText, type ClaudeRuntimeConfig } from '../runtimes/claude/agent.js';

type EmitEvent = (event: JobEvent) => void;

type FixCompilePayload = {
  context?: {
    selection?: string;
    surroundingBefore?: string;
    surroundingAfter?: string;
    compileLog?: string;
  };
  runtime?: { claude?: ClaudeRuntimeConfig };
  userSettings?: {
    enableTools?: boolean;
    enableCommandBlocklist?: boolean;
    blockedCommandsUnix?: string;
  };
};

const FIX_START = '<<<AGEAF_FIX>>>';
const FIX_END = '<<<AGEAF_FIX_END>>>';

const FIX_PROMPT = `Fix the LaTeX compile error using the selection and log.
Preserve citations, labels, refs, and math.

Output ONLY the corrected selection between the markers below (no JSON, no Markdown, no explanation):
${FIX_START}
... corrected selection here ...
${FIX_END}`;

export function buildFixCompilePrompt(payload: FixCompilePayload) {
  const selection = payload.context?.selection ?? '';
  const before = payload.context?.surroundingBefore ?? '';
  const after = payload.context?.surroundingAfter ?? '';
  const log = payload.context?.compileLog ?? '';

  return [
    FIX_PROMPT,
    '\nCompile log:\n',
    log,
    '\nContext before:\n',
    before,
    '\nSelection:\n',
    selection,
    '\nContext after:\n',
    after,
  ].join('');
}

function extractFixedText(resultText: string | null) {
  if (!resultText) return null;
  const startIndex = resultText.indexOf(FIX_START);
  if (startIndex < 0) return null;
  const endIndex = resultText.indexOf(FIX_END, startIndex + FIX_START.length);
  if (endIndex < 0) return null;
  const body = resultText.slice(startIndex + FIX_START.length, endIndex).trim();
  return body.length > 0 ? body : null;
}

export async function runFixCompileError(
  payload: FixCompilePayload,
  emitEvent: EmitEvent
) {
  const selection = payload.context?.selection ?? '';
  const patch: Patch = {
    kind: 'replaceSelection',
    text: selection,
  };

  const prompt = buildFixCompilePrompt(payload);
  emitEvent({ event: 'delta', data: { text: 'Analyzing compile log...' } });

  let doneEvent: JobEvent = { event: 'done', data: { status: 'ok' } };
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

  const status = (doneEvent.data as any)?.status;
  if (status && status !== 'ok') {
    emitEvent(doneEvent);
    return;
  }

  const fixed = extractFixedText(resultText);
  if (!fixed && process.env.AGEAF_CLAUDE_MOCK !== 'true') {
    emitEvent({
      event: 'done',
      data: { status: 'error', message: 'Fix output missing markers' },
    });
    return;
  }
  emitEvent({
    event: 'patch',
    data: { kind: 'replaceSelection', text: fixed ?? (payload.context?.selection ?? '') },
  });
  emitEvent(doneEvent);
}
