import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { JobEvent } from '../../types.js';
import { buildAttachmentBlock, getAttachmentLimits } from '../../attachments/textAttachments.js';
import { extractAgeafPatchFence } from '../../patch/ageafPatchFence.js';
import { buildReplaceRangePatchesFromFileUpdates } from '../../patch/fileUpdate.js';
import { validatePatch } from '../../validate.js';
import { getCodexAppServer } from './appServer.js';
import { parseCodexTokenUsage } from './tokenUsage.js';

// Debug logging to console (enabled via AGEAF_DEBUG_CLI=true)
const debugToConsole = process.env.AGEAF_DEBUG_CLI === 'true';
const traceAllCodexEvents = process.env.AGEAF_CODEX_TRACE_ALL_EVENTS === 'true';
const DEFAULT_CODEX_TURN_TIMEOUT_MS = 10 * 60 * 1000;
function debugLog(message: string, data?: Record<string, unknown>) {
  if (!debugToConsole) return;
  console.log(`[CODEX DEBUG] ${message}`, data ?? '');
}

type EmitEvent = (event: JobEvent) => void;

export type CodexApprovalPolicy = 'untrusted' | 'on-request' | 'on-failure' | 'never';

export type CodexRuntimeConfig = {
  cliPath?: string;
  envVars?: string;
  approvalPolicy?: CodexApprovalPolicy;
  model?: string;
  reasoningEffort?: string;
  threadId?: string;
};

type CodexImageAttachment = {
  id: string;
  name: string;
  mediaType: string;
  data: string;
  size: number;
};

type CodexJobPayload = {
  action?: string;
  context?: unknown;
  runtime?: { codex?: CodexRuntimeConfig };
  userSettings?: {
    customSystemPrompt?: string;
    displayName?: string;
    debugCliEvents?: boolean;
    surroundingContextLimit?: number;
  };
};

function getUserMessage(context: unknown): string | undefined {
  if (!context || typeof context !== 'object') return undefined;
  const value = (context as { message?: unknown }).message;
  return typeof value === 'string' ? value : undefined;
}

function getContextAttachments(context: unknown) {
  if (!context || typeof context !== 'object') return [];
  const raw = (context as { attachments?: unknown }).attachments;
  return Array.isArray(raw) ? raw : [];
}

function getContextImages(context: unknown): CodexImageAttachment[] {
  if (!context || typeof context !== 'object') return [];
  const raw = (context as { images?: unknown }).images;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as {
        id?: unknown;
        name?: unknown;
        mediaType?: unknown;
        data?: unknown;
        size?: unknown;
      };
      const id = typeof candidate.id === 'string' ? candidate.id : '';
      const name = typeof candidate.name === 'string' ? candidate.name : '';
      const mediaType =
        typeof candidate.mediaType === 'string' ? candidate.mediaType : '';
      const data = typeof candidate.data === 'string' ? candidate.data : '';
      const size = Number(candidate.size ?? NaN);
      if (!id || !name || !mediaType || !data) return null;
      if (!Number.isFinite(size) || size < 0) return null;
      if (!mediaType.startsWith('image/')) return null;
      return { id, name, mediaType, data, size };
    })
    .filter(
      (entry: CodexImageAttachment | null): entry is CodexImageAttachment =>
        Boolean(entry)
    );
}

function getContextForPrompt(
  context: unknown,
  images: CodexImageAttachment[],
  limit: number = 0
): Record<string, unknown> | null {
  const base: Record<string, unknown> = {};
  if (context && typeof context === 'object') {
    const raw = context as Record<string, unknown>;
    const pickString = (key: string, truncateMode?: 'start' | 'end') => {
      const value = raw[key];
      if (typeof value === 'string' && value.trim()) {
        if (!truncateMode || limit <= 0 || value.length <= limit) {
          base[key] = value;
        } else {
          // Truncate if limit > 0
          base[key] = truncateMode === 'start'
            ? `...${value.slice(-limit)}` // Keep end (for before)
            : `${value.slice(0, limit)}...`; // Keep start (for after)
        }
      }
    };
    pickString('message');
    pickString('selection');

    // Only send surrounding context if limit > 0
    if (limit > 0) {
      pickString('surroundingBefore', 'start'); // Keep end of "before" (closest to cursor)
      pickString('surroundingAfter', 'end');    // Keep start of "after" (closest to cursor)
    }
  }

  if (images.length > 0) {
    base.images = images.map((image) => ({
      name: image.name,
      mediaType: image.mediaType,
      size: image.size,
    }));
  }

  return Object.keys(base).length > 0 ? base : null;
}

function ensureAgeafWorkspaceCwd(): string {
  const workspace = path.join(os.homedir(), '.ageaf');
  try {
    fs.mkdirSync(workspace, { recursive: true });
  } catch {
    // ignore workspace creation failures
  }
  return workspace;
}

function getCodexSessionCwd(threadId?: string): string {
  // If no threadId, use shared workspace
  if (!threadId || !threadId.trim()) {
    return ensureAgeafWorkspaceCwd();
  }

  // Per-thread session isolation under ~/.ageaf/codex/sessions/{threadId}
  const sessionDir = path.join(os.homedir(), '.ageaf', 'codex', 'sessions', threadId.trim());
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch {
    // ignore directory creation failures
  }
  return sessionDir;
}

function extractThreadId(response: any): string | null {
  const candidate =
    response?.result?.threadId ??
    response?.result?.thread_id ??
    response?.result?.thread?.id ??
    response?.threadId ??
    response?.thread_id ??
    response?.thread?.id;
  return typeof candidate === 'string' && candidate ? candidate : null;
}

function extractEventThreadId(params: any): string | null {
  const candidate =
    params?.threadId ??
    params?.thread_id ??
    params?.thread?.id ??
    params?.thread?.threadId ??
    params?.thread?.thread_id ??
    params?.turn?.threadId ??
    params?.turn?.thread_id ??
    params?.turn?.thread?.id ??
    params?.conversation?.threadId ??
    params?.conversation?.thread_id ??
    params?.conversation?.thread?.id;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function findDeepThreadId(value: unknown) {
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const visited = new Set<unknown>();
  const MAX_DEPTH = 4;
  const MAX_VISITS = 200;
  const allowlistKeys = new Set([
    'threadId',
    'thread_id',
    'thread',
    'turn',
    'conversation',
    'request',
    'response',
    'params',
    'data',
  ]);

  while (queue.length > 0 && visited.size < MAX_VISITS) {
    const entry = queue.shift()!;
    if (entry.depth > MAX_DEPTH) continue;
    const current = entry.value;
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const obj = current as Record<string, unknown>;
    const direct =
      (typeof obj.threadId === 'string' && obj.threadId.trim() ? obj.threadId.trim() : null) ??
      (typeof obj.thread_id === 'string' && obj.thread_id.trim() ? obj.thread_id.trim() : null);
    if (direct) return direct;

    const thread = obj.thread;
    if (thread && typeof thread === 'object') {
      const threadObj = thread as Record<string, unknown>;
      const threadId =
        (typeof threadObj.id === 'string' && threadObj.id.trim() ? threadObj.id.trim() : null) ??
        (typeof threadObj.threadId === 'string' && threadObj.threadId.trim()
          ? threadObj.threadId.trim()
          : null) ??
        (typeof threadObj.thread_id === 'string' && threadObj.thread_id.trim()
          ? threadObj.thread_id.trim()
          : null);
      if (threadId) return threadId;
    }

    for (const [key, next] of Object.entries(obj)) {
      if (!allowlistKeys.has(key)) continue;
      if (next && typeof next === 'object') {
        queue.push({ value: next, depth: entry.depth + 1 });
      }
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        if (item && typeof item === 'object') {
          queue.push({ value: item, depth: entry.depth + 1 });
        }
      }
    }
  }

  return null;
}

function redactTraceLine(value: string, limit = 240) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  const redacted = normalized
    .replace(/\bsk-[A-Za-z0-9]{16,}\b/g, 'sk-…')
    .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, 'AIza…')
    .replace(/\b(?:sess|session|token|key)=[^ ]+\b/gi, (match) => match.split('=')[0] + '=…');
  return redacted.length > limit ? `${redacted.slice(0, limit)}…` : redacted;
}

function extractAssistantTextFromItem(value: any): string | null {
  if (!value || typeof value !== 'object') return null;

  // Some Codex builds nest the assistant message under `message` or `output`.
  // Try those before applying role/type heuristics to the wrapper object.
  if (value.message && typeof value.message === 'object') {
    const nested = extractAssistantTextFromItem(value.message);
    if (nested) return nested;
  }
  if (value.output && typeof value.output === 'object') {
    const nested = extractAssistantTextFromItem(value.output);
    if (nested) return nested;
  }

  const role = typeof value.role === 'string' ? value.role : null;
  const type = typeof value.type === 'string' ? value.type : null;
  const looksAssistant = role === 'assistant' || (type ? /assistant|agent/i.test(type) : false);
  if (!looksAssistant) return null;

  const direct = typeof value.text === 'string' ? value.text : null;
  if (direct && direct.trim()) return direct;

  const content = value.content;
  if (typeof content === 'string' && content.trim()) return content;

  // Some APIs structure content as an array of parts: [{ type: 'text', text: '...' }, ...]
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const entry = part as Record<string, unknown>;
        if (typeof entry.text === 'string') return entry.text;
        if (typeof entry.content === 'string') return entry.content;
        if (typeof entry.value === 'string') return entry.value;
        return '';
      })
      .filter(Boolean);
    const joined = parts.join('');
    if (joined.trim()) return joined;
  }

  const output = value.output ?? value.message;
  if (typeof output === 'string' && output.trim()) return output;

  // Some providers return output as structured parts.
  if (Array.isArray(output)) {
    const parts = output
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const entry = part as Record<string, unknown>;
        if (typeof entry.text === 'string') return entry.text;
        if (typeof entry.content === 'string') return entry.content;
        if (typeof entry.value === 'string') return entry.value;
        return '';
      })
      .filter(Boolean);
    const joined = parts.join('');
    if (joined.trim()) return joined;
  }

  return null;
}

function summarizeObjectKeys(value: unknown, limit = 24) {
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value as Record<string, unknown>).slice(0, limit);
}

function summarizeString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return { len: 0 };
  return { len: trimmed.length };
}

function summarizeRateLimits(params: unknown) {
  if (!params || typeof params !== 'object') return null;
  const obj = params as Record<string, unknown>;
  const candidate =
    (obj.rateLimits && typeof obj.rateLimits === 'object' ? (obj.rateLimits as any) : null) ??
    (obj.limits && typeof obj.limits === 'object' ? (obj.limits as any) : null) ??
    (obj.data && typeof obj.data === 'object' ? (obj.data as any) : null);

  const safePick = (value: any) => {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const remaining =
      typeof record.remaining === 'number'
        ? record.remaining
        : typeof record.remaining === 'string'
          ? Number(record.remaining)
          : null;
    const limit =
      typeof record.limit === 'number'
        ? record.limit
        : typeof record.limit === 'string'
          ? Number(record.limit)
          : null;
    const resetSeconds =
      typeof record.resetSeconds === 'number'
        ? record.resetSeconds
        : typeof record.reset === 'number'
          ? record.reset
          : typeof record.reset === 'string'
            ? Number(record.reset)
            : null;

    return {
      ...(Number.isFinite(remaining as number) ? { remaining } : {}),
      ...(Number.isFinite(limit as number) ? { limit } : {}),
      ...(Number.isFinite(resetSeconds as number) ? { resetSeconds } : {}),
      keys: summarizeObjectKeys(record, 16),
    };
  };

  const tokenCandidate =
    candidate?.tokens ?? candidate?.token ?? candidate?.tpm ?? candidate?.tokenRateLimit;
  const requestCandidate =
    candidate?.requests ?? candidate?.request ?? candidate?.rpm ?? candidate?.requestRateLimit;

  const tokens = safePick(tokenCandidate);
  const requests = safePick(requestCandidate);

  // Fallback: if we couldn't recognize structure, still return some keys so we can iterate.
  if (!tokens && !requests) {
    return {
      keys: summarizeObjectKeys(obj, 20),
      nestedKeys: candidate ? summarizeObjectKeys(candidate, 20) : undefined,
    };
  }

  return {
    ...(tokens ? { tokens } : {}),
    ...(requests ? { requests } : {}),
  };
}

function summarizeItemForDebug(item: unknown) {
  if (!item || typeof item !== 'object') {
    return { kind: typeof item };
  }
  const obj = item as Record<string, unknown>;
  const role = typeof obj.role === 'string' ? obj.role : null;
  const type = typeof obj.type === 'string' ? obj.type : null;
  const name = typeof obj.name === 'string' ? obj.name : null;
  const text = summarizeString(obj.text);
  const content =
    typeof obj.content === 'string'
      ? { len: obj.content.trim().length }
      : Array.isArray(obj.content)
        ? { parts: obj.content.length }
        : obj.content && typeof obj.content === 'object'
          ? { keys: summarizeObjectKeys(obj.content, 16) }
          : null;
  const message =
    obj.message && typeof obj.message === 'object'
      ? { keys: summarizeObjectKeys(obj.message, 16) }
      : summarizeString(obj.message);
  const output =
    obj.output && typeof obj.output === 'object'
      ? { keys: summarizeObjectKeys(obj.output, 16) }
      : summarizeString(obj.output);
  return {
    ...(role ? { role } : {}),
    ...(type ? { type } : {}),
    ...(name ? { name } : {}),
    ...(text ? { text } : {}),
    ...(content ? { content } : {}),
    ...(message ? { message } : {}),
    ...(output ? { output } : {}),
    keys: summarizeObjectKeys(obj, 28),
  };
}

function normalizeApprovalPolicy(value: unknown): CodexApprovalPolicy {
  if (value === 'untrusted' || value === 'on-request' || value === 'on-failure' || value === 'never') {
    return value;
  }
  return 'on-request';
}

function getCodexTurnTimeoutMs() {
  const raw = process.env.AGEAF_CODEX_TURN_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_CODEX_TURN_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_CODEX_TURN_TIMEOUT_MS;
  return parsed;
}

function buildPrompt(
  payload: CodexJobPayload,
  contextForPrompt: Record<string, unknown> | null
) {
  const action = payload.action ?? 'chat';
  const contextMessage =
    contextForPrompt && typeof contextForPrompt.message === 'string'
      ? contextForPrompt.message
      : undefined;
  const message = contextMessage ?? getUserMessage(payload.context) ?? '';
  const custom = payload.userSettings?.customSystemPrompt?.trim();

  const hasOverleafFileBlocks = message.includes('[Overleaf file:');
  const hasSelection =
    contextForPrompt &&
    typeof contextForPrompt.selection === 'string' &&
    contextForPrompt.selection.trim().length > 0;

  const rewriteInstructions = [
    'You are rewriting a selected LaTeX region from Overleaf.',
    'Preserve LaTeX commands, citations (\\cite{}), labels (\\label{}), refs (\\ref{}), and math.',
    '',
    'User-visible output:',
    '- First: a short bullet list of change notes (NOT in a code block).',
    '- Do NOT include the full rewritten text in the visible response.',
    '',
    'Machine-readable output (REQUIRED):',
    '- Append ONLY the rewritten selection between these markers at the VERY END of your message:',
    '<<<AGEAF_REWRITE>>>',
    '... rewritten selection here ...',
    '<<<AGEAF_REWRITE_END>>>',
    '- The markers MUST be the last thing you output (no text after).',
    '- Do NOT wrap the markers in Markdown code fences.',
  ].join('\n');

  const patchGuidance = [
    'Patch proposals (use ONLY when editing Overleaf; optional):',
    '- Use an `ageaf-patch` block ONLY if the user is asking you to modify Overleaf content (rewrite/edit selection, update a file, fix LaTeX errors, etc).',
    '- If the user is asking for general info or standalone writing (e.g. an abstract draft, explanation, today’s weather), do NOT emit `ageaf-patch` — put the full answer directly in the visible response.',
    '- If you are outputting LaTeX meant to be pasted into Overleaf, prefer a fenced code block (e.g. ```tex).',
    '- If you DO want the user to apply edits in Overleaf, include exactly one fenced code block labeled `ageaf-patch` containing ONLY a JSON object matching one of:',
    '- { "kind":"replaceSelection", "text":"..." }',
    '- { "kind":"replaceRangeInFile", "filePath":"main.tex", "expectedOldText":"...", "text":"...", "from":123, "to":456 } (from/to optional but if used must both be provided)',
    '- { "kind":"insertAtCursor", "text":"..." }',
    '- Put all explanation/change notes outside the `ageaf-patch` code block.',
    '- Avoid `insertAtCursor` patches unless the user explicitly asks to insert at the cursor.',
  ].join('\n');

  const selectionPatchGuidance = hasSelection
    ? [
      'Selection edits:',
      '- If `Context.selection` is present and the user is asking you to proofread/rewrite/edit the selection, prefer emitting a `ageaf-patch` with { "kind":"replaceSelection", "text":"..." }.',
      '- Keep the visible response short (change notes only).',
    ].join('\n')
    : '';

  const fileUpdateInstructions = [
    'Overleaf file edits:',
    '- The user may include one or more `[Overleaf file: <path>]` blocks showing the current file contents.',
    '- If the user asks you to edit/proofread/rewrite such a file, append the UPDATED FULL FILE CONTENTS inside these markers at the VERY END of your message:',
    '<<<AGEAF_FILE_UPDATE path="main.tex">>>',
    '... full updated file contents here ...',
    '<<<AGEAF_FILE_UPDATE_END>>>',
    '- Do not wrap these markers in Markdown fences.',
    '- Do not output anything after the end marker.',
    '- Put change notes in normal Markdown BEFORE the markers.',
    '- Do NOT include the full updated file contents in the visible response (only inside the markers).',
  ].join('\n');

  const baseParts = [
    'You are Ageaf, a concise Overleaf assistant.',
    'Respond in Markdown, keep it concise.',
    action === 'chat' ? patchGuidance : '',
    action === 'chat' ? selectionPatchGuidance : '',
    `Action: ${action}`,
    contextForPrompt ? `Context:\n${JSON.stringify(contextForPrompt, null, 2)}` : '',
    action === 'rewrite' ? rewriteInstructions : '',
    hasOverleafFileBlocks ? fileUpdateInstructions : '',
  ].filter(Boolean);

  if (custom) {
    baseParts.push(`\nAdditional instructions:\n${custom}`);
  }

  return baseParts.join('\n\n');
}

export async function runCodexJob(
  payload: CodexJobPayload,
  emitEvent: EmitEvent,
  options?: { jobId?: string }
) {
  if (process.env.AGEAF_CODEX_MOCK === 'true') {
    emitEvent({ event: 'delta', data: { text: 'Mock response.' } });
    emitEvent({
      event: 'usage',
      data: { model: 'mock', usedTokens: 1200, contextWindow: 200000 },
    });
    emitEvent({ event: 'done', data: { status: 'ok', threadId: 'mock-thread' } });
    return;
  }

  const runtime = payload.runtime?.codex ?? {};
  const debugCliEvents = payload.userSettings?.debugCliEvents ?? false;
  const emitTrace = (message: string, data?: Record<string, unknown>) => {
    if (!debugCliEvents) return;
    emitEvent({ event: 'trace', data: { message, ...(data ?? {}) } });
  };
  const images = getContextImages(payload.context);
  const attachments = getContextAttachments(payload.context);
  const { block: attachmentBlock } = await buildAttachmentBlock(
    attachments,
    getAttachmentLimits()
  );
  const rawMessage = getUserMessage(payload.context);
  const messageWithAttachments = [rawMessage, attachmentBlock]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n');
  const contextWithAttachments =
    payload.context && typeof payload.context === 'object'
      ? { ...(payload.context as Record<string, unknown>), message: messageWithAttachments }
      : { message: messageWithAttachments };
  const surroundingContextLimit = payload.userSettings?.surroundingContextLimit ?? 0;
  const contextForPrompt = getContextForPrompt(contextWithAttachments, images, surroundingContextLimit);

  // Debug: Log what we're sending to Codex (console only).
  if (debugToConsole) {
    const contextSummary: Record<string, any> = {};
    if (contextForPrompt) {
      for (const [key, value] of Object.entries(contextForPrompt)) {
        if (typeof value === 'string') {
          contextSummary[key] = `${value.length} chars`;
        } else {
          contextSummary[key] = value;
        }
      }
    }
    debugLog('input context', {
      ...(options?.jobId ? { jobId: options.jobId } : {}),
      attachmentBlockSize: attachmentBlock.length,
      contextFields: contextSummary,
      hasImages: images.length > 0,
      imageCount: images.length,
    });
  }

  let threadId = typeof runtime.threadId === 'string' ? runtime.threadId.trim() : '';
  const cwd = getCodexSessionCwd(threadId);
  const approvalPolicy = normalizeApprovalPolicy(runtime.approvalPolicy);
  const model =
    typeof runtime.model === 'string' && runtime.model.trim() ? runtime.model.trim() : null;
  const effort =
    typeof runtime.reasoningEffort === 'string' && runtime.reasoningEffort.trim()
      ? runtime.reasoningEffort.trim()
      : null;
  const appServer = await getCodexAppServer({
    cliPath: runtime.cliPath,
    envVars: runtime.envVars,
    cwd,
  });

  if (!threadId) {
    emitTrace('Starting Codex thread…');
    const threadResponse = await appServer.request(
      'thread/start',
      {
        model,
        modelProvider: null,
        cwd,
        approvalPolicy,
        sandbox: 'read-only',
        config: null,
        baseInstructions: null,
        developerInstructions: null,
        experimentalRawEvents: false,
      },
      { timeoutMs: 30000 }
    );
    const extracted = extractThreadId(threadResponse);
    if (!extracted) {
      emitEvent({
        event: 'done',
        data: { status: 'error', message: 'Failed to start Codex thread' },
      });
      return;
    }
    threadId = extracted;
    emitTrace('Codex thread ready', { threadId });
  } else {
    emitTrace('Resuming Codex thread…', { threadId });
    const resumeResponse = await appServer.request(
      'thread/resume',
      {
        threadId,
        history: null,
        path: null,
        model,
        modelProvider: null,
        cwd,
        approvalPolicy,
        sandbox: 'read-only',
        config: null,
        baseInstructions: null,
        developerInstructions: null,
      },
      { timeoutMs: 30000 }
    );
    const extracted = extractThreadId(resumeResponse);
    if (!extracted) {
      emitEvent({
        event: 'done',
        data: { status: 'error', message: 'Failed to resume Codex thread', threadId },
      });
      return;
    }
    threadId = extracted;
    emitTrace('Codex thread resumed', { threadId });
  }

  const prompt = buildPrompt(payload, contextForPrompt);
  const turnTimeoutMs = getCodexTurnTimeoutMs();
  emitTrace('Codex: prepared prompt', {
    action: payload.action ?? 'chat',
    promptChars: prompt.length,
    imageCount: images.length,
    attachmentCount: attachments.length,
    surroundingContextLimit,
    approvalPolicy,
    model: model ?? undefined,
    effort: effort ?? undefined,
    turnTimeoutSec: Number.isFinite(turnTimeoutMs) && turnTimeoutMs > 0
      ? Math.round(turnTimeoutMs / 1000)
      : 0,
  });

  // Debug: Log the final prompt (console only).
  if (debugToConsole) {
    debugLog('prompt', {
      ...(options?.jobId ? { jobId: options.jobId } : {}),
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 500) + (prompt.length > 500 ? '…' : ''),
    });
  }

  let done = false;
  const action = payload.action ?? 'chat';
  const shouldHidePatchPayload = true;
  const REWRITE_START = '<<<AGEAF_REWRITE>>>';
  const REWRITE_END = '<<<AGEAF_REWRITE_END>>>';
  const rewriteStartRe = /<<<\s*AGEAF_REWRITE\s*>>>/i;
  const rewriteEndRe = /<<<\s*AGEAF_REWRITE_END\s*>>>/i;
  let fullText = '';
  let visibleBuffer = '';
  let patchPayloadStarted = false;
  let patchEmitted = false;
  const patchPayloadStartRe =
    /```(?:ageaf[-_]?patch)|<<<\s*AGEAF_REWRITE\s*>>>|<<<\s*AGEAF_FILE_UPDATE\b/i;
  const HOLD_BACK_CHARS = 32;
  // Filled synchronously by the Promise executor below.
  // (Promise executors run immediately.)
  let resolveDone!: () => void;
  let unsubscribe = () => { };
  const turnStartTime = Date.now();
  let lastMessageTime = Date.now();
  const TURN_TIMEOUT_MS = getCodexTurnTimeoutMs();
  const HEARTBEAT_MS = 10000;
  let lastHeartbeatAt = 0;
  let lastTraceDiagnosticsAt = 0;
  let lastConsoleDiagnosticsAt = 0;

  const diagnostics = {
    totalEvents: 0,
    matchedEvents: 0,
    filteredEvents: 0,
    missingThreadIdEvents: 0,
    lastAnyMessageTime: Date.now(),
    lastAnyMethod: '',
    lastMatchedMethod: '',
    seenTurnStarted: false,
    seenAnyDelta: false,
    seenTurnCompleted: false,
    lastStderrLine: '',
    lastStderrAt: 0,
    lastRateLimitAt: 0,
    lastRateLimitSummary: null as Record<string, unknown> | null,
  };

  const loggedUnmatchedMethods = new Set<string>();
  const loggedMissingThreadMethods = new Set<string>();
  const loggedIgnoredApproval = new Set<string>();
  let itemShapeEmitted = 0;
  const ITEM_SHAPE_LIMIT = 8;
  let stderrEmitted = 0;
  const STDERR_TRACE_LIMIT = 20;

  const donePromise = new Promise<void>((resolve) => {
    resolveDone = () => resolve();

    const unsubscribeStderr =
      debugCliEvents || debugToConsole
        ? appServer.subscribeStderr((line) => {
          diagnostics.lastStderrLine = line;
          diagnostics.lastStderrAt = Date.now();
          if (!debugCliEvents) return;
          if (stderrEmitted >= STDERR_TRACE_LIMIT) return;
          const safe = redactTraceLine(line);
          if (!safe) return;
          stderrEmitted += 1;
          emitTrace('Codex stderr', { line: safe });
        })
        : () => { };

    unsubscribe = appServer.subscribe((message) => {
      const method = typeof message.method === 'string' ? message.method : '';
      const params = message.params as any;
      const msgThreadId =
        extractEventThreadId(params) ??
        findDeepThreadId(params) ??
        extractEventThreadId(message as any) ??
        findDeepThreadId(message as any);
      const requestId = (message as { id?: unknown }).id;
      const hasRequestId =
        typeof requestId === 'number' || typeof requestId === 'string';
      const isCodexEvent = method.startsWith('codex/event/');

      diagnostics.totalEvents += 1;
      if (method) diagnostics.lastAnyMethod = method;
      diagnostics.lastAnyMessageTime = Date.now();

      // Codex CLI rate-limit updates are global and may not include threadId.
      // Capture a safe summary so "stalls" can be distinguished from backoff/waiting.
      if (method === 'account/rateLimits/updated' || method.startsWith('account/rateLimits/')) {
        const summary = summarizeRateLimits(params);
        diagnostics.lastRateLimitAt = Date.now();
        diagnostics.lastRateLimitSummary = summary ?? { keys: summarizeObjectKeys(params, 20) };

        if (debugToConsole) {
          debugLog('rate limits updated', {
            ...(options?.jobId ? { jobId: options.jobId } : {}),
            method,
            summary: diagnostics.lastRateLimitSummary,
          });
        }
        emitTrace('Codex: rate limits updated', {
          method,
          ...(summary ? { summary } : {}),
        });
        return;
      }

      // Some Codex request/approval prompts may not carry threadId reliably.
      // Handle them before thread filtering so we don't deadlock waiting for approval.
      if (hasRequestId && method.includes('requestApproval')) {
        if (debugToConsole && !loggedIgnoredApproval.has('approval')) {
          loggedIgnoredApproval.add('approval');
          debugLog('approval request received', {
            ...(options?.jobId ? { jobId: options.jobId } : {}),
            method,
            approvalPolicy,
            eventThreadId: msgThreadId ?? undefined,
            expectedThreadId: threadId,
          });
        }
        if (approvalPolicy === 'never') {
          void appServer.respond(requestId as any, 'accept');
          emitTrace('Codex: auto-accepted approval');
          // Keep waiting for the real output events.
          return;
        }
        emitEvent({
          event: 'tool_call',
          data: {
            kind: 'approval',
            requestId,
            method,
            params: params ?? {},
          },
        });
        emitTrace('Codex: approval required');
        return;
      }

      if (hasRequestId && method === 'item/tool/requestUserInput') {
        if (debugToConsole && !loggedIgnoredApproval.has('user_input')) {
          loggedIgnoredApproval.add('user_input');
          debugLog('user input request received', {
            ...(options?.jobId ? { jobId: options.jobId } : {}),
            method,
            eventThreadId: msgThreadId ?? undefined,
            expectedThreadId: threadId,
          });
        }
        emitEvent({
          event: 'tool_call',
          data: {
            kind: 'user_input',
            requestId,
            method,
            params: params ?? {},
          },
        });
        emitTrace('Codex: user input required');
        return;
      }

      const treatThreadlessCodexEventAsMatch = isCodexEvent && !msgThreadId;

      if (!msgThreadId && !treatThreadlessCodexEventAsMatch) {
        diagnostics.missingThreadIdEvents += 1;
        if (debugToConsole && method && diagnostics.missingThreadIdEvents <= 5) {
          debugLog('event missing threadId (may be ignored)', {
            ...(options?.jobId ? { jobId: options.jobId } : {}),
            method,
          });
        }
        if (
          debugCliEvents &&
          method &&
          (method === 'turn/completed' ||
            method === 'turn/error' ||
            method === 'error' ||
            method === 'turn/started' ||
            method.startsWith('item/agentMessage')) &&
          !loggedMissingThreadMethods.has(method)
        ) {
          loggedMissingThreadMethods.add(method);
          emitTrace('Codex: event missing threadId (ignored)', { method });
        }
      }

      if (!treatThreadlessCodexEventAsMatch && msgThreadId !== threadId) {
        diagnostics.filteredEvents += 1;
        if (debugToConsole && method && diagnostics.filteredEvents <= 5) {
          debugLog('event for different thread (ignored)', {
            ...(options?.jobId ? { jobId: options.jobId } : {}),
            method,
            eventThreadId: msgThreadId ?? undefined,
            expectedThreadId: threadId,
          });
        }
        if (
          debugCliEvents &&
          method &&
          (method === 'turn/completed' || method === 'turn/error' || method === 'error') &&
          !loggedUnmatchedMethods.has(method)
        ) {
          loggedUnmatchedMethods.add(method);
          emitTrace('Codex: event for different thread (ignored)', {
            method,
            eventThreadId: msgThreadId ?? undefined,
          });
        }
        return;
      }

      diagnostics.matchedEvents += 1;
      if (method) diagnostics.lastMatchedMethod = method;
      lastMessageTime = Date.now();

      // Log ALL events when debug mode is enabled (helps discover event names)
      if (debugCliEvents && traceAllCodexEvents && method) {
        const eventSummary = {
          method,
          ...(params?.itemId ? { itemId: params.itemId } : {}),
          ...(params?.name ? { name: params.name } : {}),
          ...(params?.toolName ? { toolName: params.toolName } : {}),
          ...(params?.command ? { command: String(params.command).slice(0, 100) } : {}),
          ...(params?.type ? { type: params.type } : {}),
        };
        emitEvent({ event: 'trace', data: { message: `[Codex Event] ${method}`, ...eventSummary } });
      }

      // Handle thread/compacted events - ALWAYS show (critical operation)
      if (method === 'thread/compacted' || method === 'compaction/started' || method === 'compaction/completed') {
        const phase = method.includes('completed') ? 'compaction_complete' : 'tool_start';
        const message = method.includes('completed')
          ? 'Context compaction complete'
          : 'Compacting context... (reducing context window usage)';

        emitEvent({
          event: 'plan',
          data: {
            phase,
            toolId: 'compaction-' + Date.now(),
            toolName: 'Compacting',
            message,
          },
        });
        return;
      }

      // Human-readable trace (toggle-controlled)
      if (method === 'turn/started') {
        diagnostics.seenTurnStarted = true;
        emitTrace('Codex: turn started', {
          turnId: String(params?.turn?.id ?? params?.turnId ?? ''),
        });
      }
      if (method === 'turn/completed') {
        diagnostics.seenTurnCompleted = true;
        emitTrace('Codex: turn completed', {
          turnId: String(params?.turn?.id ?? params?.turnId ?? ''),
        });
      }
      if (method === 'thread/tokenUsage/updated') emitTrace('Codex: usage updated');
      if (method === 'error' || method === 'turn/error') {
        emitTrace('Codex: error', { message: String(params?.error?.message ?? params?.error ?? '') });
      }

      // Codex CLI variants: sometimes emits codex/event/* without threadId.
      if (isCodexEvent) {
        if (method === 'codex/event/task_started') {
          diagnostics.seenTurnStarted = true;
          emitTrace('Codex: task started');
        }
        if (method === 'codex/event/task_completed') {
          // Fall through to completion handling below.
        }
      }

      if (method === 'item/agentMessage/delta') {
        const delta = String(params?.delta ?? '');
        if (delta) {
          if (!diagnostics.seenAnyDelta) {
            diagnostics.seenAnyDelta = true;
            emitTrace('Codex: first delta received');
          }
          fullText += delta;

          if (!shouldHidePatchPayload) {
            emitEvent({ event: 'delta', data: { text: delta } });
            return;
          }

          if (patchPayloadStarted) {
            return;
          }

          visibleBuffer += delta;
          const matchIndex = visibleBuffer.search(patchPayloadStartRe);
          if (matchIndex >= 0) {
            const beforeFence = visibleBuffer.slice(0, matchIndex);
            if (beforeFence) {
              emitEvent({ event: 'delta', data: { text: beforeFence } });
            }
            patchPayloadStarted = true;
            visibleBuffer = '';
            return;
          }

          if (visibleBuffer.length > HOLD_BACK_CHARS) {
            const flush = visibleBuffer.slice(0, visibleBuffer.length - HOLD_BACK_CHARS);
            visibleBuffer = visibleBuffer.slice(-HOLD_BACK_CHARS);
            if (flush) {
              emitEvent({ event: 'delta', data: { text: flush } });
            }
          }
        }
        return;
      }

      // More general delta handler for newer Codex CLI event names.
      if (
        typeof params?.delta === 'string' &&
        params.delta &&
        method.includes('delta') &&
        !method.includes('outputDelta') &&
        !method.includes('commandExecution') &&
        !method.includes('tool') &&
        !method.includes('user_message') &&
        !method.includes('userMessage')
      ) {
        const delta = String(params.delta);
        if (!delta) return;
        if (!diagnostics.seenAnyDelta) {
          diagnostics.seenAnyDelta = true;
          emitTrace('Codex: first delta received');
        }

        fullText += delta;

        if (!shouldHidePatchPayload) {
          emitEvent({ event: 'delta', data: { text: delta } });
          return;
        }

        if (patchPayloadStarted) {
          return;
        }

        visibleBuffer += delta;
        const matchIndex = visibleBuffer.search(patchPayloadStartRe);
        if (matchIndex >= 0) {
          const beforeFence = visibleBuffer.slice(0, matchIndex);
          if (beforeFence) {
            emitEvent({ event: 'delta', data: { text: beforeFence } });
          }
          patchPayloadStarted = true;
          visibleBuffer = '';
          return;
        }

        if (visibleBuffer.length > HOLD_BACK_CHARS) {
          const flush = visibleBuffer.slice(0, visibleBuffer.length - HOLD_BACK_CHARS);
          visibleBuffer = visibleBuffer.slice(-HOLD_BACK_CHARS);
          if (flush) {
            emitEvent({ event: 'delta', data: { text: flush } });
          }
        }
        return;
      }

      // Helper function to process Codex items and emit plan events
      const processCodexItem = (item: any, itemType: string, itemId: string) => {
        // Web search
        if (itemType === 'web_search' || itemType === 'webSearch' || itemType === 'web.run') {
          const query = item?.query ?? item?.input?.query ?? item?.arguments?.query ?? '';
          emitEvent({
            event: 'plan',
            data: {
              phase: 'tool_start',
              toolId: itemId,
              toolName: 'WebSearch',
              ...(query ? { input: String(query) } : {}),
              message: 'Searching the web...',
            },
          });
          emitTrace('Codex: web search', { query });
          return true;
        }

        // MCP tool calls
        if (itemType === 'mcp_tool_call' || itemType === 'mcpToolCall' || itemType === 'mcp_call' || itemType.startsWith('mcp')) {
          const toolName = String(item?.name ?? item?.toolName ?? item?.tool ?? 'MCP Tool');
          const toolInput = item?.input ?? item?.arguments;
          emitEvent({
            event: 'plan',
            data: {
              phase: 'tool_start',
              toolId: itemId,
              toolName,
              ...(toolInput ? { input: typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput) } : {}),
              message: `Running ${toolName}...`,
            },
          });
          emitTrace('Codex: MCP tool call', { toolName });
          return true;
        }

        // Function calls / tool calls
        if (itemType === 'function_call' || itemType === 'functionCall' || itemType === 'tool_call' || itemType === 'toolCall') {
          const toolName = String(item?.name ?? item?.function?.name ?? item?.toolName ?? 'Tool');
          const toolInput = item?.arguments ?? item?.input ?? item?.function?.arguments;
          emitEvent({
            event: 'plan',
            data: {
              phase: 'tool_start',
              toolId: itemId,
              toolName,
              ...(toolInput ? { input: typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput) } : {}),
              message: `Running ${toolName}...`,
            },
          });
          emitTrace('Codex: function call', { toolName });
          return true;
        }

        // Command execution / shell
        if (itemType === 'command_execution' || itemType === 'commandExecution' || itemType === 'shell' || itemType === 'CommandExecution') {
          const command = String(item?.command ?? item?.input ?? '');
          emitEvent({
            event: 'plan',
            data: {
              phase: 'tool_start',
              toolId: itemId,
              toolName: 'Bash',
              ...(command ? { input: command.slice(0, 100) } : {}),
              message: 'Running command...',
            },
          });
          emitTrace('Codex: command execution', { command: command.slice(0, 100) });
          return true;
        }

        // File changes
        if (itemType === 'file_change' || itemType === 'fileChange' || itemType === 'FileChange' || itemType === 'apply_patch') {
          const filePath = String(item?.path ?? item?.filePath ?? item?.file ?? '');
          emitEvent({
            event: 'plan',
            data: {
              phase: 'tool_start',
              toolId: itemId,
              toolName: 'Edit',
              ...(filePath ? { input: filePath } : {}),
              message: 'Editing file...',
            },
          });
          return true;
        }

        // Context compaction (ALWAYS show - critical operation)
        if (itemType === 'contextCompaction' || itemType === 'context_compaction' || itemType === 'compaction') {
          emitEvent({
            event: 'plan',
            data: {
              phase: 'tool_start',
              toolId: itemId,
              toolName: 'Compacting',
              message: 'Compacting context... (reducing context window usage)',
            },
          });
          // Also emit as trace for visibility
          emitEvent({ event: 'trace', data: { message: 'Context compaction in progress' } });
          return true;
        }

        return false;
      };

      // Handle reasoning summary deltas (streamed thinking)
      if (method === 'item/reasoning/summaryTextDelta') {
        const delta = String(params?.delta ?? '');
        if (delta) {
          emitEvent({ event: 'delta', data: { text: delta, type: 'thinking' } });
        }
        return;
      }

      // Handle item/started events - detect tool/web search items
      if (method === 'item/started') {
        const item = params?.item ?? params;
        const itemType = String(item?.type ?? '');
        const itemId = String(item?.id ?? item?.itemId ?? Date.now());

        // Process known item types using our helper
        if (processCodexItem(item, itemType, itemId)) {
          return;
        }

        // Also try direct params if item is not nested
        if (!item?.type && params?.type) {
          if (processCodexItem(params, String(params.type), itemId)) {
            return;
          }
        }

        return;
      }

      // Handle raw reasoning text deltas
      if (method === 'item/reasoning/textDelta') {
        const delta = String(params?.delta ?? '');
        if (delta) {
          emitEvent({ event: 'delta', data: { text: delta, type: 'thinking' } });
        }
        return;
      }



      // Handle turn/item events - Codex streams tool items here
      if (method === 'turn/item') {
        const item = params?.item ?? params;
        const itemType = String(item?.type ?? item?.itemType ?? '');
        const itemId = String(item?.id ?? item?.itemId ?? Date.now());

        if (processCodexItem(item, itemType, itemId)) {
          return;
        }

        // Log unhandled item types for debugging
        if (itemType && debugCliEvents) {
          emitTrace(`Codex: unhandled turn/item type`, { itemType, itemId });
        }
        return;
      }

      // Handle conversation.item.created / conversation.item.added events
      if (method === 'conversation.item.created' || method === 'conversation.item.added') {
        const item = params?.item ?? params;
        const itemType = String(item?.type ?? item?.itemType ?? '');
        const itemId = String(item?.id ?? item?.itemId ?? Date.now());

        if (processCodexItem(item, itemType, itemId)) {
          return;
        }

        if (itemType && debugCliEvents) {
          emitTrace(`Codex: unhandled conversation.item type`, { itemType, itemId });
        }
        return;
      }

      // Handle ItemStarted events (alternative naming convention)
      if (method === 'ItemStarted' || method === 'item.started') {
        const item = params?.item ?? params;
        const itemType = String(item?.type ?? item?.itemType ?? '');
        const itemId = String(item?.id ?? item?.itemId ?? Date.now());

        if (processCodexItem(item, itemType, itemId)) {
          return;
        }
        return;
      }

      // Handle tool call / command execution start
      if (
        method === 'item/toolCall/started' ||
        method === 'item/commandExecution/started' ||
        method === 'item/tool/started'
      ) {
        const toolId = String(params?.itemId ?? params?.id ?? params?.toolCallId ?? '');
        const toolName = String(params?.name ?? params?.toolName ?? params?.command ?? 'Tool');
        const toolInput = params?.input
          ? (typeof params.input === 'string' ? params.input : JSON.stringify(params.input))
          : (typeof params?.command === 'string' ? params.command : undefined);

        emitEvent({
          event: 'plan',
          data: {
            phase: 'tool_start',
            toolId,
            toolName,
            ...(toolInput ? { input: toolInput } : {}),
            message: `Running ${toolName}...`,
          },
        });
        emitTrace(`Codex: tool started - ${toolName}`);
        return;
      }

      // Handle command execution output (optional trace)
      if (method === 'item/commandExecution/outputDelta') {
        const output = String(params?.delta ?? '');
        if (output) {
          emitTrace('Codex: command output', { output: output.slice(0, 200) });
        }
        return;
      }

      // Catch-all for item/* events that might be tool-related (web, MCP, etc.)
      // This helps capture web.run, mcp tools, and other operations
      if (method.startsWith('item/') && (
        method.includes('/started') ||
        method.includes('/added') ||
        method.includes('web') ||
        method.includes('mcp') ||
        method.includes('tool')
      )) {
        if (debugToConsole && itemShapeEmitted < ITEM_SHAPE_LIMIT) {
          itemShapeEmitted += 1;
          const item = params?.item ?? params;
          debugLog('item event (summary)', {
            ...(options?.jobId ? { jobId: options.jobId } : {}),
            method,
            eventThreadId: msgThreadId ?? undefined,
            expectedThreadId: threadId,
            paramsKeys: summarizeObjectKeys(params, 24),
            item: summarizeItemForDebug(item),
          });
        }

        // Check if this looks like a tool start event
        const hasToolIndicators = params?.name || params?.toolName || params?.type || params?.command;
        if (hasToolIndicators && !method.includes('delta') && !method.includes('output')) {
          const toolId = String(params?.itemId ?? params?.id ?? params?.toolCallId ?? Date.now());
          const toolName = String(
            params?.name ??
            params?.toolName ??
            params?.type ??
            params?.command ??
            method.split('/').pop() ??
            'Tool'
          );
          const toolInput = params?.input
            ? (typeof params.input === 'string' ? params.input : JSON.stringify(params.input))
            : (params?.query ? String(params.query) : undefined);

          emitEvent({
            event: 'plan',
            data: {
              phase: 'tool_start',
              toolId,
              toolName,
              ...(toolInput ? { input: toolInput } : {}),
              message: `Running ${toolName}...`,
            },
          });
          emitTrace(`Codex: item event captured as tool - ${method}`, { toolName });
        }
        return;
      }

      if (method === 'thread/tokenUsage/updated') {
        // Debug: Log raw token usage from Codex
        debugLog('token usage raw', { ...(options?.jobId ? { jobId: options.jobId } : {}), hasParams: Boolean(params) });
        const usage = parseCodexTokenUsage(params);
        if (usage) {
          emitEvent({
            event: 'usage',
            data: {
              model: null,
              usedTokens: usage.usedTokens,
              contextWindow: usage.contextWindow,
            },
          });
        }
        return;
      }

      if (method === 'turn/completed') {
        if (!done) {
          done = true;
          if (shouldHidePatchPayload && !patchPayloadStarted && visibleBuffer) {
            emitEvent({ event: 'delta', data: { text: visibleBuffer } });
            visibleBuffer = '';
          }

          if (!patchEmitted) {
            const fence = extractAgeafPatchFence(fullText);
            if (fence) {
              try {
                const patch = validatePatch(JSON.parse(fence));
                emitEvent({ event: 'patch', data: patch });
                patchEmitted = true;
              } catch {
                // Ignore patch parse failures; user can still read the raw response.
              }
            }
          }

          if (!patchEmitted && action === 'rewrite') {
            const startMatch = rewriteStartRe.exec(fullText);
            if (startMatch) {
              const endMatch = rewriteEndRe.exec(
                fullText.slice(startMatch.index + startMatch[0].length)
              );
              if (endMatch) {
                const startIndex = startMatch.index + startMatch[0].length;
                const endIndex = startIndex + endMatch.index;
                const rewritten = fullText.slice(startIndex, endIndex).trim();
                if (rewritten) {
                  emitEvent({ event: 'patch', data: { kind: 'replaceSelection', text: rewritten } });
                  patchEmitted = true;
                }
              }
            }
          }

          if (!patchEmitted) {
            const patches = buildReplaceRangePatchesFromFileUpdates({
              output: fullText,
              message: messageWithAttachments,
            });
            if (patches.length > 0) {
              emitEvent({ event: 'patch', data: patches[0] });
              patchEmitted = true;
            }
          }
          emitEvent({ event: 'done', data: { status: 'ok', threadId } });
        }
        unsubscribe();
        resolve();
        return;
      }

      // Codex CLI variants may signal completion via codex/event/task_completed.
      if (method === 'codex/event/task_completed') {
        if (!done) {
          done = true;
          if (shouldHidePatchPayload && !patchPayloadStarted && visibleBuffer) {
            emitEvent({ event: 'delta', data: { text: visibleBuffer } });
            visibleBuffer = '';
          }
          emitEvent({ event: 'done', data: { status: 'ok', threadId } });
        }
        unsubscribe();
        resolve();
        return;
      }

      // Some Codex builds deliver assistant output in item/completed with full content.
      if (method === 'item/completed' || method === 'codex/event/item_completed') {
        const item =
          params?.item ??
          params?.data?.item ??
          params?.result?.item ??
          (params?.output ? { role: 'assistant', output: params.output } : null);
        const extractedText = extractAssistantTextFromItem(item);
        if ((!extractedText || !extractedText.trim()) && debugToConsole && itemShapeEmitted < ITEM_SHAPE_LIMIT) {
          itemShapeEmitted += 1;
          debugLog('item/completed without assistant text (summary)', {
            ...(options?.jobId ? { jobId: options.jobId } : {}),
            method,
            eventThreadId: msgThreadId ?? undefined,
            expectedThreadId: threadId,
            paramsKeys: summarizeObjectKeys(params, 24),
            item: summarizeItemForDebug(item ?? params),
          });
        }
        if (extractedText && extractedText.trim()) {
          if (!diagnostics.seenAnyDelta) {
            diagnostics.seenAnyDelta = true;
            emitTrace('Codex: first delta received');
          }
          // Avoid duplicating output if we already received deltas.
          if (!fullText.trim()) {
            fullText = extractedText;
          } else if (!fullText.includes(extractedText)) {
            fullText += extractedText;
          }

          if (!shouldHidePatchPayload) {
            emitEvent({ event: 'delta', data: { text: extractedText } });
          } else if (!patchPayloadStarted) {
            visibleBuffer += extractedText;
            const matchIndex = visibleBuffer.search(patchPayloadStartRe);
            if (matchIndex >= 0) {
              const beforeFence = visibleBuffer.slice(0, matchIndex);
              if (beforeFence) {
                emitEvent({ event: 'delta', data: { text: beforeFence } });
              }
              patchPayloadStarted = true;
              visibleBuffer = '';
            } else {
              emitEvent({ event: 'delta', data: { text: visibleBuffer } });
              visibleBuffer = '';
            }
          }
        }
        // Don't return: item/completed can occur alongside turn/completed.
      }

      if (method === 'error' || method === 'turn/error') {
        if (!done) {
          done = true;
          const errorMessage = String(params?.error?.message ?? params?.error ?? 'Turn failed');
          emitEvent({
            event: 'done',
            data: { status: 'error', message: errorMessage, threadId },
          });
        }
        unsubscribe();
        resolve();
        return;
      }
    });

    // Ensure stderr subscription is cleaned up when the JSON-RPC subscription is removed.
    const originalUnsubscribe = unsubscribe;
    unsubscribe = () => {
      try {
        originalUnsubscribe();
      } finally {
        unsubscribeStderr();
      }
    };

    // Attach diagnostics to the heartbeat loop (debug-only) without spamming the user-visible plan.
  });

  const input = [
    ...images.map((image) => ({
      type: 'image',
      url: `data:${image.mediaType};base64,${image.data}`,
    })),
    { type: 'text', text: prompt },
  ];

  // Debug: Log turn/start input (console only, not frontend)
  if (debugToConsole) {
    const textInput = input.find(i => i.type === 'text');
    debugLog('turn/start input', {
      ...(options?.jobId ? { jobId: options.jobId } : {}),
      imageCount: images.length,
      textLength: textInput && 'text' in textInput ? textInput.text.length : 0,
      totalInputItems: input.length,
    });
  }

  emitTrace('Codex: sending turn/start request');
  if (debugToConsole) {
    debugLog('sending turn/start', {
      ...(options?.jobId ? { jobId: options.jobId } : {}),
      threadId,
      approvalPolicy,
      model: model ?? undefined,
      effort: effort ?? undefined,
    });
  }
  const turnResponse = await appServer.request(
    'turn/start',
    {
      threadId,
      input,
      cwd,
      approvalPolicy,
      sandboxPolicy: { type: 'readOnly' },
      model,
      effort,
      summary: null,
      outputSchema: null,
      collaborationMode: null,
    },
    { timeoutMs: 30000 }
  );
  lastMessageTime = Date.now();
  emitTrace('Codex: turn/start acknowledged', {
    hasResult: Boolean((turnResponse as any)?.result),
    hasError: Boolean((turnResponse as any)?.error),
  });
  if (debugToConsole) {
    debugLog('turn/start acknowledged', {
      ...(options?.jobId ? { jobId: options.jobId } : {}),
      hasResult: Boolean((turnResponse as any)?.result),
      hasError: Boolean((turnResponse as any)?.error),
    });
  }

  if (!done && turnResponse && Object.prototype.hasOwnProperty.call(turnResponse, 'error')) {
    done = true;
    const errorMessage = String((turnResponse as any).error?.message ?? (turnResponse as any).error ?? 'Turn failed');
    emitEvent({
      event: 'done',
      data: { status: 'error', message: errorMessage, threadId },
    });
    unsubscribe();
    resolveDone();
  }

  // Ensure the job never hangs forever if the Codex CLI stalls (common near 100% context).
  let heartbeatId: NodeJS.Timeout | null = null;
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<void>((resolve) => {
    if (!Number.isFinite(TURN_TIMEOUT_MS) || TURN_TIMEOUT_MS <= 0) return;
    timeoutId = setTimeout(() => resolve(), TURN_TIMEOUT_MS);
  });

  heartbeatId = setInterval(() => {
    if (done) return;
    const now = Date.now();
    if (now - lastHeartbeatAt < HEARTBEAT_MS) return;
    lastHeartbeatAt = now;
    const totalSec = Math.round((now - turnStartTime) / 1000);
    const idleSec = Math.round((now - lastMessageTime) / 1000);
    emitEvent({
      event: 'plan',
      data: { message: `Waiting for Codex… (${totalSec}s, last event ${idleSec}s ago)` },
    });

    // Emit richer diagnostics to trace (debug-only) every ~30s.
    if (debugCliEvents && now - lastTraceDiagnosticsAt >= 30000) {
      lastTraceDiagnosticsAt = now;
      emitTrace('Codex: waiting diagnostics', {
        threadId,
        totalSec,
        idleSec,
        anyIdleSec: Math.round((now - diagnostics.lastAnyMessageTime) / 1000),
        turnTimeoutSec: Number.isFinite(TURN_TIMEOUT_MS) ? Math.round(TURN_TIMEOUT_MS / 1000) : 0,
        seenTurnStarted: diagnostics.seenTurnStarted,
        seenAnyDelta: diagnostics.seenAnyDelta,
        seenTurnCompleted: diagnostics.seenTurnCompleted,
        totalEvents: diagnostics.totalEvents,
        matchedEvents: diagnostics.matchedEvents,
        filteredEvents: diagnostics.filteredEvents,
        missingThreadIdEvents: diagnostics.missingThreadIdEvents,
        lastAnyMethod: diagnostics.lastAnyMethod || undefined,
        lastMatchedMethod: diagnostics.lastMatchedMethod || undefined,
        ...(diagnostics.lastRateLimitSummary
          ? {
            lastRateLimit: diagnostics.lastRateLimitSummary,
            rateLimitIdleSec: Math.round((now - diagnostics.lastRateLimitAt) / 1000),
          }
          : {}),
        ...(diagnostics.lastStderrLine
          ? {
            lastStderr: redactTraceLine(diagnostics.lastStderrLine),
            stderrIdleSec: Math.round((now - diagnostics.lastStderrAt) / 1000),
          }
          : {}),
      });
    }

    if (debugToConsole && now - lastConsoleDiagnosticsAt >= 30000) {
      lastConsoleDiagnosticsAt = now;
      debugLog('waiting diagnostics', {
        ...(options?.jobId ? { jobId: options.jobId } : {}),
        threadId,
        totalSec,
        idleSec,
        anyIdleSec: Math.round((now - diagnostics.lastAnyMessageTime) / 1000),
        seenTurnStarted: diagnostics.seenTurnStarted,
        seenAnyDelta: diagnostics.seenAnyDelta,
        seenTurnCompleted: diagnostics.seenTurnCompleted,
        totalEvents: diagnostics.totalEvents,
        matchedEvents: diagnostics.matchedEvents,
        filteredEvents: diagnostics.filteredEvents,
        missingThreadIdEvents: diagnostics.missingThreadIdEvents,
        lastAnyMethod: diagnostics.lastAnyMethod || undefined,
        lastMatchedMethod: diagnostics.lastMatchedMethod || undefined,
        ...(diagnostics.lastRateLimitSummary
          ? {
            lastRateLimit: diagnostics.lastRateLimitSummary,
            rateLimitIdleSec: Math.round((now - diagnostics.lastRateLimitAt) / 1000),
          }
          : {}),
        ...(diagnostics.lastStderrLine
          ? {
            lastStderr: redactTraceLine(diagnostics.lastStderrLine),
            stderrIdleSec: Math.round((now - diagnostics.lastStderrAt) / 1000),
          }
          : {}),
      });
    }
  }, HEARTBEAT_MS);

  await Promise.race([donePromise, timeoutPromise]);
  if (!done) {
    done = true;
    const seconds = Math.round(TURN_TIMEOUT_MS / 1000);
    const last = diagnostics.lastMatchedMethod || diagnostics.lastAnyMethod || 'unknown';
    emitEvent({
      event: 'done',
      data: {
        status: 'error',
        message: `Codex timed out after ${seconds}s (last event: ${last}). Try starting a new chat.`,
        threadId,
      },
    });
    emitTrace('Codex: timed out', {
      threadId,
      seconds,
      lastMatchedMethod: diagnostics.lastMatchedMethod || undefined,
      lastAnyMethod: diagnostics.lastAnyMethod || undefined,
      ...(diagnostics.lastRateLimitSummary ? { lastRateLimit: diagnostics.lastRateLimitSummary } : {}),
    });
    if (debugToConsole) {
      debugLog('timed out', {
        ...(options?.jobId ? { jobId: options.jobId } : {}),
        threadId,
        seconds,
        last,
        ...(diagnostics.lastRateLimitSummary ? { lastRateLimit: diagnostics.lastRateLimitSummary } : {}),
      });
    }
  }
  unsubscribe();
  if (timeoutId) clearTimeout(timeoutId);
  if (heartbeatId) clearInterval(heartbeatId);
}
