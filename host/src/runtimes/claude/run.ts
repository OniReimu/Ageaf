import type { JobEvent } from '../../types.js';
import { runClaudeText, type ClaudeRuntimeConfig } from './agent.js';
import { getClaudeRuntimeStatus } from './client.js';
import type { CommandBlocklistConfig } from './safety.js';

type EmitEvent = (event: JobEvent) => void;

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
  const prompt = payload.context
    ? `${basePrompt}\\n\\n${runtimeNote}\\n\\nAction: ${action}\\nContext:\\n${JSON.stringify(payload.context, null, 2)}`
    : `${basePrompt}\\n\\nAction: ${action}`;

  const safety: CommandBlocklistConfig = {
    enabled: payload.userSettings?.enableCommandBlocklist ?? false,
    patternsText: payload.userSettings?.blockedCommandsUnix,
  };

  const enableTools = payload.userSettings?.enableTools ?? false;

  await runClaudeText({
    prompt,
    emitEvent,
    runtime: payload.runtime?.claude,
    safety,
    enableTools,
  });
}
