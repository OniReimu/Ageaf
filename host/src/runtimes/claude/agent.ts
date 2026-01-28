import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import type { JobEvent, Patch } from '../../types.js';
import { getClaudeSessionCwd } from './cwd.js';
import { getEnhancedPath, parseEnvironmentVariables, resolveClaudeCliPath } from './cli.js';
import {
  CommandBlocklistConfig,
  compileBlockedCommandPatterns,
  extractCommandFromToolInput,
  matchBlockedCommand,
  parseBlockedCommandPatterns,
} from './safety.js';
import { loadHostSettings } from '../../hostSettings.js';

type EmitEvent = (event: JobEvent) => void;

type StructuredPatchInput = {
  prompt: string;
  fallbackPatch?: Patch;
  emitEvent: EmitEvent;
  runtime?: ClaudeRuntimeConfig;
  safety?: CommandBlocklistConfig;
  enableTools?: boolean;
};

type TextRunInput = {
  prompt: string | AsyncIterable<SDKUserMessage>;
  emitEvent: EmitEvent;
  runtime?: ClaudeRuntimeConfig;
  safety?: CommandBlocklistConfig;
  enableTools?: boolean;
};

export type ClaudeRuntimeConfig = {
  cliPath?: string;
  envVars?: string;
  loadUserSettings?: boolean;
  model?: string;
  maxThinkingTokens?: number | null;
  yoloMode?: boolean;
  sessionScope?: 'project' | 'home';
  conversationId?: string;
};

const PatchSchema = z.object({
  kind: z.enum(['replaceSelection', 'insertAtCursor']),
  text: z.string(),
});

async function runQuery(
  prompt: string | AsyncIterable<SDKUserMessage>,
  emitEvent: EmitEvent,
  runtime: ClaudeRuntimeConfig,
  structuredOutput?: { schema: z.ZodSchema; name: string },
  safety?: CommandBlocklistConfig,
  enableTools?: boolean
) {
  const customEnv = parseEnvironmentVariables(runtime.envVars ?? '');
  const resolvedCliPath = resolveClaudeCliPath(runtime.cliPath, customEnv.PATH);
  const combinedEnv = {
    ...process.env,
    ...customEnv,
    PATH: getEnhancedPath(customEnv.PATH, resolvedCliPath ?? runtime.cliPath),
  };

  const apiKey =
    customEnv.ANTHROPIC_API_KEY ??
    customEnv.ANTHROPIC_AUTH_TOKEN ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.ANTHROPIC_AUTH_TOKEN;

  if (!resolvedCliPath && !apiKey) {
    emitEvent({
      event: 'done',
      data: {
        status: 'not_configured',
        message: 'Claude Code is not configured. Open a terminal, log in, then retry.',
      },
    });
    return;
  }

  const configuredModel =
    runtime.model ??
    customEnv.ANTHROPIC_MODEL ??
    process.env.ANTHROPIC_MODEL;

  const yoloMode = runtime.yoloMode ?? true;
  const permissionMode = yoloMode ? 'bypassPermissions' : 'default';

  const hostToolsEnabled = loadHostSettings().toolsEnabled;
  const toolsEnabled =
    process.env.AGEAF_ENABLE_TOOLS === 'true' &&
    hostToolsEnabled === true &&
    enableTools === true;
  const blockedPatterns =
    safety?.enabled
      ? compileBlockedCommandPatterns(
          parseBlockedCommandPatterns(safety.patternsText)
        )
      : [];

  const response = query({
    prompt,
    options: {
      ...(configuredModel ? { model: configuredModel } : {}),
      ...(typeof runtime.maxThinkingTokens === 'number'
        ? { maxThinkingTokens: runtime.maxThinkingTokens }
        : {}),
      cwd: getClaudeSessionCwd(runtime),
      continue: true,
      permissionMode,
      ...(permissionMode === 'bypassPermissions'
        ? { allowDangerouslySkipPermissions: true }
        : {}),
      pathToClaudeCodeExecutable: resolvedCliPath ?? undefined,
      includePartialMessages: true,
      canUseTool: async (toolName, input, options) => {
        if (!toolsEnabled) {
          return {
            behavior: 'deny',
            message: 'Tools disabled for Ageaf host runtime',
            toolUseID: options.toolUseID,
          };
        }

        if (blockedPatterns.length > 0) {
          const command = extractCommandFromToolInput(toolName, input);
          if (command) {
            const matched = matchBlockedCommand(command, blockedPatterns);
            if (matched) {
              return {
                behavior: 'deny',
                message: `Blocked by Safety settings (matched: ${matched})`,
                toolUseID: options.toolUseID,
              };
            }
          }
        }

        return { behavior: 'allow', toolUseID: options.toolUseID };
      },
      settingSources: runtime.loadUserSettings ? ['user', 'project'] : ['project'],
      env: combinedEnv,
    },
  });

  let doneEmitted = false;
  let resultText = '';
  let sawStreamText = false;

  const emitUsage = (resultMessage: {
    modelUsage?: Record<string, unknown>;
  }) => {
    const usageRecord = resultMessage.modelUsage as Record<string, any> | undefined;
    if (!usageRecord || typeof usageRecord !== 'object') return;

    const entries = Object.entries(usageRecord);
    if (entries.length === 0) return;

    const picked =
      (configuredModel && entries.find(([key]) => key === configuredModel)) ??
      entries[0];
    if (!picked) return;

    const [model, usage] = picked as [string, any];
    const usedTokens =
      (typeof usage?.inputTokens === 'number' ? usage.inputTokens : 0) +
      (typeof usage?.cacheReadInputTokens === 'number' ? usage.cacheReadInputTokens : 0) +
      (typeof usage?.cacheCreationInputTokens === 'number' ? usage.cacheCreationInputTokens : 0);
    const contextWindow =
      typeof usage?.contextWindow === 'number' ? usage.contextWindow : null;

    emitEvent({
      event: 'usage',
      data: {
        model,
        usedTokens,
        contextWindow,
      },
    });
  };

  for await (const message of response) {
    switch (message.type) {
      case 'assistant': {
        // When includePartialMessages=true, we may receive both 'assistant' messages and
        // low-level 'stream_event' deltas for the same content. Prefer stream deltas
        // to avoid duplicating output in the client UI.
        if (sawStreamText) break;
        const blocks = (message as { message?: { content?: unknown } }).message?.content;
        if (Array.isArray(blocks)) {
          for (const block of blocks) {
            if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
              const text = (block as { text?: unknown }).text;
              if (typeof text === 'string' && text) {
                emitEvent({ event: 'delta', data: { text } });
              }
            }
          }
        }
        break;
      }
      case 'stream_event': {
        const event = (message as { event?: any }).event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          sawStreamText = true;
          emitEvent({ event: 'delta', data: { text: event.delta.text } });
        }
        if (event?.type === 'content_block_start' && event.content_block?.type === 'text') {
          if (event.content_block.text) {
            sawStreamText = true;
          }
          emitEvent({ event: 'delta', data: { text: event.content_block.text } });
        }
        break;
      }
      case 'result': {
        const resultMessage = message as { subtype?: string; result?: string; structured_output?: unknown };
        resultText = resultMessage.result ?? '';
        emitUsage(resultMessage as { modelUsage?: Record<string, unknown> });
        if (structuredOutput) {
          let candidate: unknown = resultMessage.structured_output ?? resultText;
          if (typeof candidate === 'string') {
            try {
              candidate = JSON.parse(candidate);
            } catch {
              // keep as string
            }
          }
          const parsed = structuredOutput.schema.safeParse(candidate);
          if (parsed.success) {
            emitEvent({ event: 'patch', data: parsed.data });
          } else {
            emitEvent({
              event: 'done',
              data: { status: 'error', message: 'Invalid structured output' },
            });
            doneEmitted = true;
            break;
          }
        }
        if (resultMessage.subtype && resultMessage.subtype !== 'success') {
          emitEvent({ event: 'done', data: { status: 'error', message: resultMessage.subtype } });
          doneEmitted = true;
          break;
        }
        emitEvent({ event: 'done', data: { status: 'ok' } });
        doneEmitted = true;
        break;
      }
      default:
        break;
    }
  }

  if (!doneEmitted) {
    emitEvent({ event: 'done', data: { status: 'ok' } });
  }
}

export async function runClaudeStructuredPatch(input: StructuredPatchInput) {
  if (process.env.AGEAF_CLAUDE_MOCK === 'true') {
    if (input.fallbackPatch) {
      input.emitEvent({ event: 'patch', data: input.fallbackPatch });
    }
    input.emitEvent({ event: 'done', data: { status: 'ok' } });
    return;
  }

  await runQuery(
    input.prompt,
    input.emitEvent,
    input.runtime ?? {},
    {
      schema: PatchSchema,
      name: 'patch',
    },
    input.safety,
    input.enableTools
  );
}

export async function runClaudeText(input: TextRunInput) {
  if (process.env.AGEAF_CLAUDE_MOCK === 'true') {
    input.emitEvent({ event: 'delta', data: { text: 'Mock response.' } });
    input.emitEvent({
      event: 'usage',
      data: {
        model: 'mock',
        usedTokens: 1200,
        contextWindow: 200000,
      },
    });
    input.emitEvent({ event: 'done', data: { status: 'ok' } });
    return;
  }

  await runQuery(
    input.prompt,
    input.emitEvent,
    input.runtime ?? {},
    undefined,
    input.safety,
    input.enableTools
  );
}

export function parsePatchCandidate(data: unknown): Patch | null {
  const parsed = PatchSchema.safeParse(data);
  if (!parsed.success) return null;
  return parsed.data;
}
