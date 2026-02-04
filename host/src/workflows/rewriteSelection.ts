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

function extractBetweenMarkers(resultText: string) {
  const startIndex = resultText.indexOf(REWRITE_START);
  if (startIndex < 0) return null;
  const endIndex = resultText.indexOf(REWRITE_END, startIndex + REWRITE_START.length);
  if (endIndex < 0) return null;
  const body = resultText.slice(startIndex + REWRITE_START.length, endIndex).trim();
  return body.length > 0 ? body : null;
}

function extractFromUnclosedMarkers(resultText: string) {
  const startIndex = resultText.indexOf(REWRITE_START);
  const endIndex = resultText.indexOf(REWRITE_END);
  if (startIndex >= 0 && endIndex < 0) {
    const body = resultText.slice(startIndex + REWRITE_START.length).trim();
    return body.length > 0 ? body : null;
  }
  if (endIndex >= 0 && startIndex < 0) {
    const body = resultText.slice(0, endIndex).trim();
    return body.length > 0 ? body : null;
  }
  return null;
}

function extractLastFencedBlock(resultText: string) {
  // Prefer the last fenced code block (often the model emits the rewrite as ```latex ...```).
  const fence = /```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null = null;
  let last: string | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((match = fence.exec(resultText))) {
    const body = (match[1] ?? '').trim();
    if (body) last = body;
  }
  return last;
}

function extractTrailingText(resultText: string) {
  // Remove any leading "change notes" bullet list and take the remaining text.
  const lines = resultText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) break;
    const isBullet =
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      trimmed.startsWith('• ') ||
      /^\d+\.\s+/.test(trimmed);
    if (!isBullet) break;
    i += 1;
  }
  // Skip blank lines after bullets.
  while (i < lines.length && !(lines[i] ?? '').trim()) i += 1;
  const rest = lines.slice(i).join('\n').trim();
  if (rest) return rest;

  // Fallback: last non-empty paragraph-like block.
  const blocks = resultText.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  const last = blocks.length > 0 ? blocks[blocks.length - 1] : '';
  return last || null;
}

export function extractRewriteTextWithFallback(resultText: string | null) {
  if (!resultText) return { text: null, usedFallback: false };

  const between = extractBetweenMarkers(resultText);
  if (between) return { text: between, usedFallback: false };

  const unclosed = extractFromUnclosedMarkers(resultText);
  if (unclosed) return { text: unclosed, usedFallback: true };

  const fenced = extractLastFencedBlock(resultText);
  if (fenced) return { text: fenced, usedFallback: true };

  const trailing = extractTrailingText(resultText);
  if (trailing) return { text: trailing, usedFallback: true };

  return { text: null, usedFallback: true };
}

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
