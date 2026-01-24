import type { JobEvent, Patch } from '../types.js';
import { runClaudeStructuredPatch, type ClaudeRuntimeConfig } from '../runtimes/claude/agent.js';

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

const FIX_PROMPT = `Fix the LaTeX compile error using the selection and log.
Preserve citations, labels, refs, and math.
Return a JSON object only: {\"kind\":\"replaceSelection\",\"text\":\"...\"}.`;

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
  await runClaudeStructuredPatch({
    prompt,
    fallbackPatch: patch,
    emitEvent,
    runtime: payload.runtime?.claude,
    safety: {
      enabled: payload.userSettings?.enableCommandBlocklist ?? false,
      patternsText: payload.userSettings?.blockedCommandsUnix,
    },
    enableTools: payload.userSettings?.enableTools ?? false,
  });
}
