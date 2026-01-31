import type { JobEvent } from '../../types.js';
import { buildAttachmentBlock, getAttachmentLimits } from '../../attachments/textAttachments.js';
import { runClaudeText, type ClaudeRuntimeConfig } from './agent.js';
import { getClaudeRuntimeStatus } from './client.js';
import type { CommandBlocklistConfig } from './safety.js';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { buildReplaceRangePatchesFromFileUpdates } from '../../patch/fileUpdate.js';

type EmitEvent = (event: JobEvent) => void;

type ClaudeImageAttachment = {
  id: string;
  name: string;
  mediaType: string;
  data: string;
  size: number;
};

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

type ClaudeUserMessage = {
  role: 'user';
  content: ClaudeContentBlock[];
};

type ClaudeJobPayload = {
  action?: string;
  context?: unknown;
  runtime?: { claude?: ClaudeRuntimeConfig };
  userSettings?: {
    displayName?: string;
    customSystemPrompt?: string;
    enableTools?: boolean;
    enableCommandBlocklist?: boolean;
    blockedCommandsUnix?: string;
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

function getContextImages(context: unknown): ClaudeImageAttachment[] {
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
      (entry: ClaudeImageAttachment | null): entry is ClaudeImageAttachment =>
        Boolean(entry)
    );
}

function getContextForPrompt(
  context: unknown,
  images: ClaudeImageAttachment[]
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

function buildImagePromptStream(
  promptText: string,
  images: ClaudeImageAttachment[]
): AsyncIterable<SDKUserMessage> {
  const contentBlocks: ClaudeContentBlock[] = [
    ...images.map((image) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: image.mediaType,
        data: image.data,
      },
    })),
    { type: 'text', text: promptText },
  ];

  const message: ClaudeUserMessage = {
    role: 'user',
    content: contentBlocks,
  };

  return {
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'user',
        message,
        parent_tool_use_id: null,
        session_id: '',
      };
    },
  };
}

function isShortGreeting(message?: string): boolean {
  if (!message) return false;
  const normalized = message.trim().toLowerCase();
  if (!normalized || normalized.length > 40) return false;
  return /^(hi|hello|hey|hiya|yo|sup|good (morning|afternoon|evening)|thanks|thank you|ok|okay|k|cool|got it|sounds good|great|awesome)[!. ,?]*$/.test(
    normalized
  );
}

export async function runClaudeJob(
  payload: ClaudeJobPayload,
  emitEvent: EmitEvent
) {
  const action = payload.action ?? 'chat';
  const runtimeStatus = getClaudeRuntimeStatus(payload.runtime?.claude);
  const message = getUserMessage(payload.context);
  const attachments = getContextAttachments(payload.context);
  const images = getContextImages(payload.context);
  const { block: attachmentBlock } = await buildAttachmentBlock(
    attachments,
    getAttachmentLimits()
  );
  const messageWithAttachments = [message, attachmentBlock]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n');
  const hasOverleafFileBlocks = messageWithAttachments.includes('[Overleaf file:');
  const contextWithAttachments =
    payload.context && typeof payload.context === 'object'
      ? { ...(payload.context as Record<string, unknown>), message: messageWithAttachments }
      : { message: messageWithAttachments };
  const contextForPrompt = getContextForPrompt(contextWithAttachments, images);
  const greetingMode = isShortGreeting(message);
  const displayName = payload.userSettings?.displayName?.trim();
  const customSystemPrompt = payload.userSettings?.customSystemPrompt?.trim();
  
  const runtimeNote = `Runtime note: This request is executed via ${
    runtimeStatus.cliPath ? 'Claude Code CLI' : 'Anthropic API'
  }.
Model setting: ${runtimeStatus.model ?? 'default'} (source: ${
    runtimeStatus.modelSource
  }).
If asked about the model/runtime, use this note and do not guess.`;
  const responseGuidance = [
    'Response style:',
    '- Respond in Markdown by default (headings, lists, code, checkboxes allowed).',
    '- Keep responses concise and avoid long project summaries unless asked.',
    '- Keep formatting minimal and readable; brief bullets and task checkboxes are OK.',
  ].join('\n');
  const patchGuidance = [
    'Patch proposals (optional):',
    '- If you want the user to apply edits in Overleaf, include exactly one fenced code block labeled `ageaf-patch` containing ONLY a JSON object matching one of:',
    '- { "kind":"replaceSelection", "text":"..." }',
    '- { "kind":"replaceRangeInFile", "filePath":"main.tex", "expectedOldText":"...", "text":"...", "from":123, "to":456 } (from/to optional but if used must both be provided)',
    '- { "kind":"insertAtCursor", "text":"..." }',
    '- Put all explanation/change notes outside the `ageaf-patch` code block.',
    '- Also show the proposed new text to the user separately (e.g., in a ` ```latex ` code block).',
  ].join('\n');
  const fileUpdateGuidance = [
    'Overleaf file edits:',
    '- The user may include one or more `[Overleaf file: <path>]` blocks showing the current file contents.',
    '- If the user asks you to edit/proofread/rewrite such a file, append the UPDATED FULL FILE CONTENTS inside these markers at the VERY END of your message:',
    '<<<AGEAF_FILE_UPDATE path="main.tex">>>',
    '... full updated file contents here ...',
    '<<<AGEAF_FILE_UPDATE_END>>>',
    '- Do not wrap these markers in Markdown fences.',
    '- Do not output anything after the end marker.',
    '- Put change notes in normal Markdown BEFORE the markers.',
  ].join('\n');
  const greetingGuidance = [
    'Greeting behavior:',
    '- If the user message is a short greeting or acknowledgement, reply with a brief greeting (1 sentence).',
    displayName ? `- Address the user as "${displayName}".` : '',
    '- Optionally mention one short suggestion or a prior task.',
    '- End with: "What would you like to work on?"',
    '- Do not summarize the document or infer project details unless asked.',
  ].filter(line => line).join('\n');
  
  const baseParts = [
    'You are Ageaf, a concise Overleaf assistant.',
    responseGuidance,
    patchGuidance,
    hasOverleafFileBlocks ? fileUpdateGuidance : '',
    greetingMode ? greetingGuidance : 'If the user message is not a greeting, respond normally but stay concise.',
  ];
  
  if (customSystemPrompt) {
    baseParts.push(`\nAdditional instructions:\n${customSystemPrompt}`);
  }
  
  const basePrompt = baseParts.join('\n\n');
  const promptText = contextForPrompt
    ? `${basePrompt}\\n\\n${runtimeNote}\\n\\nAction: ${action}\\nContext:\\n${JSON.stringify(contextForPrompt, null, 2)}`
    : `${basePrompt}\\n\\n${runtimeNote}\\n\\nAction: ${action}`;

  const safety: CommandBlocklistConfig = {
    enabled: payload.userSettings?.enableCommandBlocklist ?? false,
    patternsText: payload.userSettings?.blockedCommandsUnix,
  };

  const enableTools = payload.userSettings?.enableTools ?? false;

  let doneEvent: JobEvent | null = null;
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

  const resultText = await runClaudeText({
    prompt: images.length > 0 ? buildImagePromptStream(promptText, images) : promptText,
    emitEvent: wrappedEmit,
    runtime: payload.runtime?.claude,
    safety,
    enableTools,
  });

  const status = (doneEvent as any)?.data?.status;
  if (status && status !== 'ok') {
    emitEvent(doneEvent as JobEvent);
    return;
  }

  if (!patchEmitted && hasOverleafFileBlocks && typeof resultText === 'string' && resultText) {
    const patches = buildReplaceRangePatchesFromFileUpdates({
      output: resultText,
      message: messageWithAttachments,
    });
    for (const patch of patches) {
      emitEvent({ event: 'patch', data: patch });
      patchEmitted = true;
      break;
    }
  }

  emitEvent(doneEvent ?? { event: 'done', data: { status: 'ok' } });
}
