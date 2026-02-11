import type { JobEvent } from '../../types.js';
import { buildAttachmentBlock, getAttachmentLimits } from '../../attachments/textAttachments.js';
import {
  buildDocumentAttachmentBlock,
  type DocumentAttachmentEntry,
} from '../../attachments/documentAttachments.js';
import { buildReplaceRangePatchesFromFileUpdates } from '../../patch/fileUpdate.js';
import { runPiText, evictPiSession as evictAgent, type PiRuntimeConfig } from './agent.js';
import { buildPiSystemPrompt } from './prompt.js';
import { loadSkillsManifest, buildSkillsGuidance, findSkillByName, loadSkillMarkdown } from './skills.js';
import { getPiPreferences } from './preferences.js';
import { getPiRuntimeStatus } from './client.js';
import {
  extractRewriteTextWithFallback,
  buildRewritePrompt,
  REWRITE_START,
  REWRITE_END,
} from '../../workflows/rewriteExtraction.js';
import { clearPiUsage } from './context.js';

type EmitEvent = (event: JobEvent) => void;

type PiImageAttachment = {
  id: string;
  name: string;
  mediaType: string;
  data: string;
  size: number;
};

export type PiJobPayload = {
  action?: string;
  context?: unknown;
  runtime?: { pi?: PiRuntimeConfig };
  userSettings?: {
    displayName?: string;
    customSystemPrompt?: string;
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

function getContextDocuments(context: unknown): DocumentAttachmentEntry[] {
  if (!context || typeof context !== 'object') return [];
  const raw = (context as { documents?: unknown }).documents;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry: unknown): entry is DocumentAttachmentEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Record<string, unknown>;
      return (
        typeof candidate.name === 'string' &&
        typeof candidate.mediaType === 'string' &&
        typeof candidate.size === 'number' &&
        (typeof candidate.data === 'string' || typeof candidate.path === 'string')
      );
    })
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : undefined,
      name: entry.name,
      mediaType: entry.mediaType,
      data: typeof entry.data === 'string' ? entry.data : undefined,
      path: typeof entry.path === 'string' ? entry.path : undefined,
      size: entry.size,
    }));
}

function getContextForPrompt(
  context: unknown,
  limit: number = 0,
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
          base[key] = truncateMode === 'start'
            ? `...${value.slice(-limit)}`
            : `${value.slice(0, limit)}...`;
        }
      }
    };
    pickString('message');
    pickString('selection');
    if (limit > 0) {
      pickString('surroundingBefore', 'start');
      pickString('surroundingAfter', 'end');
    }
  }
  return Object.keys(base).length > 0 ? base : null;
}

function isShortGreeting(message?: string): boolean {
  if (!message) return false;
  const normalized = message.trim().toLowerCase();
  if (!normalized || normalized.length > 40) return false;
  return /^(hi|hello|hey|hiya|yo|sup|good (morning|afternoon|evening)|thanks|thank you|ok|okay|k|cool|got it|sounds good|great|awesome)[!. ,?]*$/.test(
    normalized,
  );
}

export async function runPiJob(
  payload: PiJobPayload,
  emitEvent: EmitEvent,
): Promise<void> {
  const action = payload.action ?? 'chat';
  const message = getUserMessage(payload.context);
  const attachments = getContextAttachments(payload.context);
  const documentEntries = getContextDocuments(payload.context);

  // Build attachment blocks (text extraction only for pi — no native PDF content blocks)
  const [{ block: attachmentBlock }, { block: documentBlock }] = await Promise.all([
    buildAttachmentBlock(attachments, getAttachmentLimits()),
    buildDocumentAttachmentBlock(documentEntries),
  ]);

  const messageWithAttachments = [message, attachmentBlock, documentBlock]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n');
  const hasOverleafFileBlocks = messageWithAttachments.includes('[Overleaf file:');
  const contextWithAttachments =
    payload.context && typeof payload.context === 'object'
      ? { ...(payload.context as Record<string, unknown>), message: messageWithAttachments }
      : { message: messageWithAttachments };
  const surroundingContextLimit = payload.userSettings?.surroundingContextLimit ?? 0;
  const contextForPrompt = getContextForPrompt(contextWithAttachments, surroundingContextLimit);
  const greetingMode = isShortGreeting(message);
  const displayName = payload.userSettings?.displayName?.trim();
  let customSystemPrompt = payload.userSettings?.customSystemPrompt?.trim() ?? '';
  const hasSelection =
    contextForPrompt &&
    typeof contextForPrompt.selection === 'string' &&
    (contextForPrompt.selection as string).trim().length > 0;

  // Load skills dynamically
  const manifest = loadSkillsManifest();
  const skillsGuidance = buildSkillsGuidance(manifest);

  // Fallback skill injection: if no customSystemPrompt but message starts with /skillName
  if (!customSystemPrompt && message) {
    const slashMatch = message.match(/^\/(\S+)/);
    if (slashMatch) {
      const skill = findSkillByName(manifest, slashMatch[1]);
      if (skill) {
        const markdown = loadSkillMarkdown(skill);
        if (markdown) {
          customSystemPrompt = markdown;
        }
      }
    }
  }

  // Resolve preferences
  const preferences = getPiPreferences();
  const runtimeConfig: PiRuntimeConfig = {
    provider: payload.runtime?.pi?.provider ?? preferences.provider ?? undefined,
    model: payload.runtime?.pi?.model ?? preferences.model ?? undefined,
    thinkingLevel: payload.runtime?.pi?.thinkingLevel ?? preferences.thinkingLevel ?? 'off',
    conversationId: payload.runtime?.pi?.conversationId,
  };

  const status = getPiRuntimeStatus();
  const runtimeNote = `Runtime note: This request is executed via BYOK (pi-ai) runtime.
Provider: ${status.activeProvider ?? 'auto-detect'}.
Model setting: ${runtimeConfig.model ?? 'default'}.
If asked about the model/runtime, use this note and do not guess.`;

  // Handle rewrite action
  if (action === 'rewrite') {
    emitEvent({ event: 'delta', data: { text: 'Preparing rewrite...' } });

    const rewritePromptText = buildRewritePrompt(payload as any);
    const systemPrompt = buildPiSystemPrompt({
      action,
      contextForPrompt: null,
      hasOverleafFileBlocks: false,
      hasSelection: true,
      greetingMode: false,
      displayName,
      customSystemPrompt,
      runtimeNote,
      skillsGuidance,
    });

    let doneEvent: JobEvent = { event: 'done', data: { status: 'ok' } };
    const wrappedEmit: EmitEvent = (event) => {
      if (event.event === 'done') {
        doneEvent = event;
        return;
      }
      emitEvent(event);
    };

    const { resultText } = await runPiText({
      systemPrompt,
      userMessage: rewritePromptText,
      emitEvent: wrappedEmit,
      config: runtimeConfig,
    });

    const doneStatus = (doneEvent.data as any)?.status;
    if (doneStatus && doneStatus !== 'ok') {
      emitEvent(doneEvent);
      return;
    }

    if (process.env.AGEAF_PI_MOCK === 'true') {
      const selection = (payload.context as any)?.selection ?? '';
      emitEvent({ event: 'patch', data: { kind: 'replaceSelection', text: selection } });
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
    const selection = (payload.context as any)?.selection ?? '';
    emitEvent({
      event: 'patch',
      data: { kind: 'replaceSelection', text: rewritten ?? selection },
    });
    emitEvent(doneEvent);
    return;
  }

  // Handle fix_error action
  if (action === 'fix_error') {
    const compileLog = (payload.context as any)?.compileLog ?? '';
    const fixPrompt = [
      'Fix the LaTeX compile error shown below.',
      'Output the corrected code between these markers:',
      '<<<AGEAF_FIX>>>',
      '... corrected code ...',
      '<<<AGEAF_FIX_END>>>',
      '',
      'Compile log:',
      compileLog,
    ].join('\n');

    const systemPrompt = buildPiSystemPrompt({
      action,
      contextForPrompt,
      hasOverleafFileBlocks,
      hasSelection: !!hasSelection,
      greetingMode: false,
      displayName,
      customSystemPrompt,
      runtimeNote,
      skillsGuidance,
    });

    let doneEvent: JobEvent = { event: 'done', data: { status: 'ok' } };
    const wrappedEmit: EmitEvent = (event) => {
      if (event.event === 'done') {
        doneEvent = event;
        return;
      }
      emitEvent(event);
    };

    const { resultText } = await runPiText({
      systemPrompt,
      userMessage: fixPrompt,
      emitEvent: wrappedEmit,
      config: runtimeConfig,
      overleafMessage: hasOverleafFileBlocks ? messageWithAttachments : undefined,
    });

    const doneStatus = (doneEvent.data as any)?.status;
    if (doneStatus && doneStatus !== 'ok') {
      emitEvent(doneEvent);
      return;
    }

    // Extract fix between markers
    if (typeof resultText === 'string' && resultText) {
      const fixStart = resultText.indexOf('<<<AGEAF_FIX>>>');
      const fixEnd = resultText.indexOf('<<<AGEAF_FIX_END>>>');
      if (fixStart >= 0 && fixEnd > fixStart) {
        const fixed = resultText.slice(fixStart + '<<<AGEAF_FIX>>>'.length, fixEnd).trim();
        if (fixed) {
          emitEvent({
            event: 'patch',
            data: { kind: 'replaceSelection', text: fixed },
          });
        }
      }
    }

    emitEvent(doneEvent);
    return;
  }

  // Default: chat action
  const systemPrompt = buildPiSystemPrompt({
    action,
    contextForPrompt,
    hasOverleafFileBlocks,
    hasSelection: !!hasSelection,
    greetingMode,
    displayName,
    customSystemPrompt,
    runtimeNote,
    skillsGuidance,
  });

  let doneEvent: JobEvent = { event: 'done', data: { status: 'ok' } };
  let patchEmitted = false;
  const wrappedEmit: EmitEvent = (event) => {
    if (event.event === 'done') {
      doneEvent = event;
      return;
    }
    if (event.event === 'patch') {
      patchEmitted = true;
    }
    emitEvent(event);
  };

  const { resultText, emittedPatchFiles } = await runPiText({
    systemPrompt,
    userMessage: messageWithAttachments,
    emitEvent: wrappedEmit,
    config: runtimeConfig,
    overleafMessage: hasOverleafFileBlocks ? messageWithAttachments : undefined,
  });

  const doneStatus = (doneEvent.data as any)?.status;
  if (doneStatus && doneStatus !== 'ok') {
    emitEvent(doneEvent);
    return;
  }

  // Post-process: extract remaining AGEAF_FILE_UPDATE blocks
  if (hasOverleafFileBlocks && typeof resultText === 'string' && resultText) {
    const patches = buildReplaceRangePatchesFromFileUpdates({
      output: resultText,
      message: messageWithAttachments,
    });
    for (const patch of patches) {
      if (patch.kind === 'replaceRangeInFile' && emittedPatchFiles.has(patch.filePath)) continue;
      emitEvent({ event: 'patch', data: patch });
      patchEmitted = true;
    }
  }

  emitEvent(doneEvent);
}

export function evictPiSession(conversationId: string): void {
  evictAgent(conversationId);
  clearPiUsage(conversationId);
}
