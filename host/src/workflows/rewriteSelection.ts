import type { JobEvent, Patch } from '../types.js';
import { runClaudeStructuredPatch, type ClaudeRuntimeConfig } from '../runtimes/claude/agent.js';

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

const REWRITE_PROMPT = `Rewrite the selected LaTeX text for clarity and academic tone.
Preserve all LaTeX commands, citations (e.g., \\cite{}), labels (\\label{}), references (\\ref{}), and math.
Return a JSON object only: {\"kind\":\"replaceSelection\",\"text\":\"...\"}.`;

export function buildRewritePrompt(payload: RewritePayload) {
  const selection = payload.context?.selection ?? '';
  const before = payload.context?.surroundingBefore ?? '';
  const after = payload.context?.surroundingAfter ?? '';

  return [
    REWRITE_PROMPT,
    '\nContext before:\n',
    before,
    '\nSelection:\n',
    selection,
    '\nContext after:\n',
    after,
  ].join('');
}

export async function runRewriteSelection(payload: RewritePayload, emitEvent: EmitEvent) {
  const selection = payload.context?.selection ?? '';
  const patch: Patch = {
    kind: 'replaceSelection',
    text: selection,
  };

  const prompt = buildRewritePrompt(payload);
  emitEvent({ event: 'delta', data: { text: 'Preparing rewrite...' } });
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
