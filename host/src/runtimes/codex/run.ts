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
  images: CodexImageAttachment[]
): Record<string, unknown> | null {
  const base: Record<string, unknown> = {};
  if (context && typeof context === 'object') {
    const raw = context as Record<string, unknown>;
    const pickString = (key: string) => {
      const value = raw[key];
      if (typeof value === 'string' && value.trim()) {
        base[key] = value;
      }
    };
    pickString('message');
    pickString('selection');
    pickString('surroundingBefore');
    pickString('surroundingAfter');
    pickString('compileLog');
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

function normalizeApprovalPolicy(value: unknown): CodexApprovalPolicy {
  if (value === 'untrusted' || value === 'on-request' || value === 'on-failure' || value === 'never') {
    return value;
  }
  return 'on-request';
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

export async function runCodexJob(payload: CodexJobPayload, emitEvent: EmitEvent) {
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
  const contextForPrompt = getContextForPrompt(contextWithAttachments, images);
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
    const threadResponse = await appServer.request('thread/start', {
      model,
      modelProvider: null,
      cwd,
      approvalPolicy,
      sandbox: 'read-only',
      config: null,
      baseInstructions: null,
      developerInstructions: null,
      experimentalRawEvents: false,
    });
    const extracted = extractThreadId(threadResponse);
    if (!extracted) {
      emitEvent({
        event: 'done',
        data: { status: 'error', message: 'Failed to start Codex thread' },
      });
      return;
    }
    threadId = extracted;
  } else {
    const resumeResponse = await appServer.request('thread/resume', {
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
    });
    const extracted = extractThreadId(resumeResponse);
    if (!extracted) {
      emitEvent({
        event: 'done',
        data: { status: 'error', message: 'Failed to resume Codex thread', threadId },
      });
      return;
    }
    threadId = extracted;
  }

  const prompt = buildPrompt(payload, contextForPrompt);
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
  let unsubscribe = () => {};

  const donePromise = new Promise<void>((resolve) => {
    resolveDone = () => resolve();
    unsubscribe = appServer.subscribe((message) => {
      const method = typeof message.method === 'string' ? message.method : '';
      const params = message.params as any;
      const msgThreadId = String(params?.threadId ?? params?.thread_id ?? '');
      const requestId = (message as { id?: unknown }).id;
      const hasRequestId =
        typeof requestId === 'number' || typeof requestId === 'string';

      if (msgThreadId !== threadId) return;

      if (hasRequestId && method.includes('requestApproval')) {
        if (approvalPolicy === 'never') {
          void appServer.respond(requestId as any, 'accept');
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
        return;
      }

      if (hasRequestId && method === 'item/tool/requestUserInput') {
        emitEvent({
          event: 'tool_call',
          data: {
            kind: 'user_input',
            requestId,
            method,
            params: params ?? {},
          },
        });
        return;
      }

      if (method === 'item/agentMessage/delta') {
        const delta = String(params?.delta ?? '');
        if (delta) {
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

      if (method === 'thread/tokenUsage/updated') {
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
  });

  const input = [
    ...images.map((image) => ({
      type: 'image',
      url: `data:${image.mediaType};base64,${image.data}`,
    })),
    { type: 'text', text: prompt },
  ];

  const turnResponse = await appServer.request('turn/start', {
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
  });

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

  await donePromise;
}
