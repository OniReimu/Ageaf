import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentEvent, ThinkingLevel } from '@mariozechner/pi-agent-core';
import {
  getProviders,
  getModels,
  getEnvApiKey,
} from '@mariozechner/pi-ai';
import type { Model, AssistantMessage, Message, Usage } from '@mariozechner/pi-ai';
import type { AgentMessage } from '@mariozechner/pi-agent-core';

import type { JobEvent } from '../../types.js';
import { PiStreamBuffer, extractOverleafFilesFromMessage } from './streamBuffer.js';
import { createMermaidTools } from './tools.js';
import { addPiUsage } from './context.js';

type EmitEvent = (event: JobEvent) => void;

export type PiRuntimeConfig = {
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  conversationId?: string;
};

export type PiTextRunInput = {
  systemPrompt: string;
  userMessage: string;
  emitEvent: EmitEvent;
  config?: PiRuntimeConfig;
  overleafMessage?: string;
};

export type PiRunResult = {
  resultText: string | null;
  emittedPatchFiles: Set<string>;
};

/**
 * APIs where `store: false` is hardcoded in pi-ai, making server-side item
 * references (textSignature, thinkingSignature, tool-call item IDs) invalid on
 * subsequent turns. Other APIs (google-*, anthropic-messages, openai-completions,
 * azure-openai-responses) either don't set store:false or use signatures
 * differently, so they are left untouched.
 */
// If pi-ai adds another Responses-style API with store:false, add it here.
const STORE_FALSE_APIS = new Set(['openai-responses', 'openai-codex-responses']);

/**
 * Custom convertToLlm that strips server-side item references from assistant
 * messages produced by Responses APIs with `store: false`.
 *
 * Specifically strips:
 * - textSignature (maps to `id` on "message" output items → rs_* / msg_*)
 * - thinkingSignature (maps to reasoning item IDs)
 * - tool-call item ID suffix (call_id|item_id → call_id only, since item_id
 *   references a stored fc_* item)
 *
 * Messages from other APIs pass through unchanged.
 */
/** @internal Exported for testing only. */
export function convertToLlmStripSignatures(messages: AgentMessage[]): Message[] {
  return messages
    .filter((m): m is Message => m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult')
    .map((m) => {
      if (m.role !== 'assistant') return m;
      if (!STORE_FALSE_APIS.has(m.api)) return m;
      return {
        ...m,
        content: m.content.map((block) => {
          if (block.type === 'text' && block.textSignature) {
            const { textSignature, ...rest } = block;
            return rest;
          }
          if (block.type === 'thinking' && block.thinkingSignature) {
            const { thinkingSignature, ...rest } = block;
            return rest;
          }
          if (block.type === 'toolCall' && block.id && block.id.includes('|')) {
            return { ...block, id: block.id.split('|')[0] };
          }
          return block;
        }),
      } as AssistantMessage;
    });
}

// Session management: agent instances keyed by conversationId
const agentSessions = new Map<string, Agent>();

const DEFAULT_TURN_TIMEOUT_MS = 300_000; // 5 minutes

function resolveModel(config?: PiRuntimeConfig): Model<any> | null {
  // Priority: env override > config > auto-detect
  const providerName =
    process.env.AGEAF_PI_PROVIDER?.trim() ??
    config?.provider ??
    null;
  const modelId =
    process.env.AGEAF_PI_MODEL?.trim() ??
    config?.model ??
    null;

  if (providerName && modelId) {
    // Try to find exact model
    try {
      const models = getModels(providerName as any);
      const found = models.find((m) => m.id === modelId);
      if (found) return found;
    } catch {
      // Fall through to auto-detect
    }
  }

  if (providerName) {
    // Use first model from specified provider
    try {
      const models = getModels(providerName as any);
      if (models.length > 0) return models[0];
    } catch {
      // Fall through
    }
  }

  // Auto-detect: anthropic > openai > google > first with key
  const preferred = ['anthropic', 'openai', 'google'];
  const providers = getProviders();

  for (const pref of preferred) {
    if (!providers.includes(pref as any)) continue;
    if (!getEnvApiKey(pref)) continue;
    try {
      const models = getModels(pref as any);
      if (modelId) {
        const found = models.find((m) => m.id === modelId);
        if (found) return found;
      }
      if (models.length > 0) return models[0];
    } catch {
      continue;
    }
  }

  // Fallback: first provider with an API key
  for (const provider of providers) {
    if (!getEnvApiKey(provider)) continue;
    try {
      const models = getModels(provider as any);
      if (models.length > 0) return models[0];
    } catch {
      continue;
    }
  }

  return null;
}

function resolveThinkingLevel(config?: PiRuntimeConfig): ThinkingLevel {
  const level = config?.thinkingLevel?.trim()?.toLowerCase() ?? 'off';
  const valid: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  return valid.includes(level as ThinkingLevel) ? (level as ThinkingLevel) : 'off';
}

function getOrCreateAgent(conversationId?: string): Agent {
  if (conversationId) {
    const existing = agentSessions.get(conversationId);
    if (existing) return existing;
  }

  const agent = new Agent({ convertToLlm: convertToLlmStripSignatures });
  agent.setTools(createMermaidTools());

  if (conversationId) {
    agentSessions.set(conversationId, agent);
  }

  return agent;
}

export function evictPiSession(conversationId: string): void {
  const agent = agentSessions.get(conversationId);
  if (agent) {
    agent.abort();
    agentSessions.delete(conversationId);
  }
}

export async function runPiText(input: PiTextRunInput): Promise<PiRunResult> {
  // Mock mode
  if (process.env.AGEAF_PI_MOCK === 'true') {
    input.emitEvent({ event: 'delta', data: { text: 'Mock response.' } });
    input.emitEvent({
      event: 'usage',
      data: { model: 'mock', usedTokens: 1200, contextWindow: 200000 },
    });
    input.emitEvent({ event: 'done', data: { status: 'ok' } });
    return { resultText: 'Mock response.', emittedPatchFiles: new Set() };
  }

  const model = resolveModel(input.config);
  if (!model) {
    input.emitEvent({
      event: 'done',
      data: {
        status: 'not_configured',
        message: 'No API key found. Add an API key (e.g. OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY) to host/.env, then restart the host.',
      },
    });
    return { resultText: null, emittedPatchFiles: new Set() };
  }

  const thinkingLevel = resolveThinkingLevel(input.config);
  const conversationId = input.config?.conversationId;
  const agent = getOrCreateAgent(conversationId);

  // Configure agent
  agent.setModel(model);
  agent.setSystemPrompt(input.systemPrompt);
  if (thinkingLevel !== 'off') {
    agent.setThinkingLevel(thinkingLevel);
  }

  // Set up stream buffer for visible text / patch processing
  const overleafFiles = input.overleafMessage
    ? extractOverleafFilesFromMessage(input.overleafMessage)
    : [];
  const streamBuffer = new PiStreamBuffer(input.emitEvent, overleafFiles);

  let resultText = '';
  let doneEmitted = false;

  const timeoutMs = Number(process.env.AGEAF_PI_TURN_TIMEOUT_MS) || DEFAULT_TURN_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => {
    agent.abort();
  }, timeoutMs);

  let unsubscribe: (() => void) | undefined;
  try {
    // Subscribe to agent events
    unsubscribe = agent.subscribe((event: AgentEvent) => {
      switch (event.type) {
        case 'message_update': {
          const ame = event.assistantMessageEvent;
          if (ame.type === 'text_delta') {
            streamBuffer.pushDelta(ame.delta);
          } else if (ame.type === 'thinking_delta') {
            input.emitEvent({
              event: 'delta',
              data: { text: ame.delta, type: 'thinking' },
            });
          } else if (ame.type === 'toolcall_start') {
            const partial = ame.partial;
            const toolContent = partial.content[ame.contentIndex];
            const toolName = toolContent && 'name' in toolContent ? toolContent.name : 'unknown';
            input.emitEvent({
              event: 'plan',
              data: {
                message: `Running ${toolName}`,
                toolName,
                phase: 'tool_start',
              },
            });
          }
          // toolcall_delta: accumulate internally, no emit
          // toolcall_end: handled by tool_execution_end
          break;
        }

        case 'tool_execution_start': {
          input.emitEvent({
            event: 'plan',
            data: {
              message: `Running ${event.toolName}`,
              toolName: event.toolName,
              phase: 'tool_start',
            },
          });
          break;
        }

        case 'turn_end': {
          // Emit usage from the assistant message
          const msg = event.message as AssistantMessage;
          if (msg && msg.role === 'assistant' && msg.usage) {
            const usage = msg.usage;
            const usedTokens = usage.totalTokens;
            const contextWindow = model.contextWindow ?? null;

            input.emitEvent({
              event: 'usage',
              data: { model: model.id, usedTokens, contextWindow },
            });

            // Track cumulative usage
            if (conversationId) {
              addPiUsage(conversationId, usage, model.id, model.contextWindow);
            }
          }
          break;
        }

        case 'agent_end': {
          streamBuffer.flush();

          // Collect full result text
          const messages = event.messages;
          for (const m of messages) {
            if ((m as AssistantMessage).role === 'assistant') {
              const assistantMsg = m as AssistantMessage;
              for (const c of assistantMsg.content) {
                if (c.type === 'text') {
                  resultText += c.text;
                }
              }
            }
          }

          // Check last assistant message for error
          const lastAssistant = [...messages]
            .reverse()
            .find((m) => (m as AssistantMessage).role === 'assistant') as
            | AssistantMessage
            | undefined;

          if (
            lastAssistant &&
            (lastAssistant.stopReason === 'error' || lastAssistant.stopReason === 'aborted')
          ) {
            input.emitEvent({
              event: 'done',
              data: {
                status: 'error',
                message: lastAssistant.errorMessage ?? lastAssistant.stopReason,
              },
            });
            doneEmitted = true;
          }
          break;
        }

        // Other events: no-op
        default:
          break;
      }
    });

    // Send the user message
    await agent.prompt(input.userMessage);
  } catch (error) {
    if (!doneEmitted) {
      input.emitEvent({
        event: 'done',
        data: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Pi runtime error',
        },
      });
      doneEmitted = true;
    }
  } finally {
    unsubscribe?.();
    clearTimeout(timeoutHandle);
  }

  if (!doneEmitted) {
    input.emitEvent({ event: 'done', data: { status: 'ok' } });
  }

  return { resultText, emittedPatchFiles: streamBuffer.getEmittedPatchFiles() };
}
