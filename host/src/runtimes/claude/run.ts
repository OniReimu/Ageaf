import type { JobEvent } from '../../types.js';
import { runClaudeText, type ClaudeRuntimeConfig } from './agent.js';
import { getClaudeRuntimeStatus } from './client.js';
import type { CommandBlocklistConfig } from './safety.js';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

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
  const contentBlocks = [
    ...images.map((image) => ({
      type: 'image',
      source: {
        type: 'base64',
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
  const images = getContextImages(payload.context);
  const contextForPrompt = getContextForPrompt(payload.context, images);
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

  await runClaudeText({
    prompt:
      images.length > 0 ? buildImagePromptStream(promptText, images) : promptText,
    emitEvent,
    runtime: payload.runtime?.claude,
    safety,
    enableTools,
  });
}
