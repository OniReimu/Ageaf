import { query, type OutputFormat, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { mermaidMcpServer } from '../../mcp/mermaidServer.js';

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
import { extractAgeafPatchFence } from '../../patch/ageafPatchFence.js';

type EmitEvent = (event: JobEvent) => void;

type StructuredPatchInput = {
  prompt: string;
  fallbackPatch?: Patch;
  emitEvent: EmitEvent;
  runtime?: ClaudeRuntimeConfig;
  safety?: CommandBlocklistConfig;
  enableTools?: boolean;
  debugCliEvents?: boolean;
};

type TextRunInput = {
  prompt: string | AsyncIterable<SDKUserMessage>;
  emitEvent: EmitEvent;
  runtime?: ClaudeRuntimeConfig;
  safety?: CommandBlocklistConfig;
  enableTools?: boolean;
  debugCliEvents?: boolean;
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

const PatchSchema = z.union([
  z.object({
    kind: z.literal('replaceSelection'),
    text: z.string(),
  }),
  z.object({
    kind: z.literal('insertAtCursor'),
    text: z.string(),
  }),
  z
    .object({
      kind: z.literal('replaceRangeInFile'),
      filePath: z.string(),
      expectedOldText: z.string(),
      text: z.string(),
      from: z.number().int().nonnegative().optional(),
      to: z.number().int().nonnegative().optional(),
    })
    .refine(
      (value) =>
        (typeof value.from !== 'number' && typeof value.to !== 'number') ||
        (typeof value.from === 'number' &&
          typeof value.to === 'number' &&
          value.to >= value.from),
      { message: 'from/to must both be provided when used' }
    ),
]);

const PATCH_OUTPUT_FORMAT: OutputFormat = {
  type: 'json_schema',
  schema: {
    oneOf: [
      {
        type: 'object',
        properties: {
          kind: { const: 'replaceSelection' },
          text: { type: 'string' },
        },
        required: ['kind', 'text'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          kind: { const: 'insertAtCursor' },
          text: { type: 'string' },
        },
        required: ['kind', 'text'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          kind: { const: 'replaceRangeInFile' },
          filePath: { type: 'string' },
          expectedOldText: { type: 'string' },
          text: { type: 'string' },
          from: { type: 'number' },
          to: { type: 'number' },
        },
        required: ['kind', 'filePath', 'expectedOldText', 'text'],
        additionalProperties: false,
      },
    ],
  },
};

export function getStructuredOutputFormat(name?: string): OutputFormat | null {
  if (name === 'patch') return PATCH_OUTPUT_FORMAT;
  return null;
}

function stripJsonCodeFences(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  // ```json\n{...}\n``` or ```\n{...}\n```
  return trimmed.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```$/, '').trim();
}

function extractJsonObject(value: string): unknown {
  const text = stripJsonCodeFences(value);
  // Fast path: the whole string is JSON
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }
  // Best-effort: parse the first {...} block (handles extra prose around JSON)
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return value;
  try {
    return JSON.parse(match[0]);
  } catch {
    return value;
  }
}

async function runQuery(
  prompt: string | AsyncIterable<SDKUserMessage>,
  emitEvent: EmitEvent,
  runtime: ClaudeRuntimeConfig,
  structuredOutput?: { schema: z.ZodSchema; name: string },
  safety?: CommandBlocklistConfig,
  enableTools?: boolean
): Promise<string | null> {
  const customEnv = parseEnvironmentVariables(runtime.envVars ?? '');
  const resolvedCliPath = resolveClaudeCliPath(runtime.cliPath, customEnv.PATH);
  const combinedEnv = {
    ...process.env,
    ...customEnv,
    PATH: getEnhancedPath(customEnv.PATH, resolvedCliPath ?? runtime.cliPath),
  };

  // Track sensitive keys for cleanup
  const sensitiveKeys = Object.keys(customEnv).filter(
    (key) =>
      key.includes('API_KEY') ||
      key.includes('SECRET') ||
      key.includes('TOKEN') ||
      key.includes('AUTH')
  );

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
    return null;
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

  const outputFormat = structuredOutput
    ? getStructuredOutputFormat(structuredOutput.name)
    : null;
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
      mcpServers: {
        'ageaf-mermaid': mermaidMcpServer,
      },
      allowedTools: [
        'mcp__ageaf-mermaid__render_mermaid',
        'mcp__ageaf-mermaid__list_mermaid_themes',
      ],
      ...(outputFormat ? { outputFormat } : {}),
    },
  });

  let doneEmitted = false;
  let resultText = '';
  let sawStreamText = false;
  let visibleBuffer = '';
  let payloadStarted = false;
  const payloadStartRe =
    /```(?:ageaf[-_]?patch)|<<<\s*AGEAF_REWRITE\s*>>>|<<<\s*AGEAF_FILE_UPDATE\b/i;
  const HOLD_BACK_CHARS = 32;
  let insideDiagramFence = false;
  let diagramBuffer = '';
  const diagramOpenRe = /```ageaf-diagram[^\n]*\n/i;

  const emitVisibleDelta = (text: string) => {
    if (!text) return;
    if (payloadStarted) return;

    // --- Diagram fence accumulation mode ---
    if (insideDiagramFence) {
      diagramBuffer += text;
      const closeIdx = diagramBuffer.indexOf('\n```');
      if (closeIdx !== -1) {
        const afterBackticks = closeIdx + 4;
        const ch = diagramBuffer[afterBackticks];
        if (ch === undefined || ch === '\n' || ch === '\r' || ch === ' ' || ch === '\t') {
          // Found the closing fence
          const restAfterClose = diagramBuffer.slice(afterBackticks);
          const nlPos = restAfterClose.indexOf('\n');
          const closingLineLen = nlPos >= 0 ? nlPos + 1 : restAfterClose.length;
          const fenceContent = diagramBuffer.slice(0, closeIdx);
          const completeFence = '```ageaf-diagram\n' + fenceContent + '\n```\n';
          emitEvent({ event: 'delta', data: { text: completeFence } });
          insideDiagramFence = false;
          const remaining = diagramBuffer.slice(afterBackticks + closingLineLen);
          diagramBuffer = '';
          if (remaining) {
            emitVisibleDelta(remaining);
          }
          return;
        }
      }
      return;
    }

    visibleBuffer += text;

    // --- Check for diagram fence opening ---
    const diagMatch = visibleBuffer.match(diagramOpenRe);
    if (diagMatch && diagMatch.index !== undefined) {
      const before = visibleBuffer.slice(0, diagMatch.index);
      if (before) {
        emitEvent({ event: 'delta', data: { text: before } });
      }
      emitEvent({ event: 'delta', data: { text: '\n*Rendering diagram\u2026*\n' } });
      insideDiagramFence = true;
      diagramBuffer = visibleBuffer.slice(diagMatch.index + diagMatch[0].length);
      visibleBuffer = '';
      return;
    }

    // --- Check for payload start (existing logic) ---
    const matchIndex = visibleBuffer.search(payloadStartRe);
    if (matchIndex >= 0) {
      const beforePayload = visibleBuffer.slice(0, matchIndex);
      if (beforePayload) {
        emitEvent({ event: 'delta', data: { text: beforePayload } });
      }
      payloadStarted = true;
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
  };

  const flushVisible = () => {
    if (insideDiagramFence) {
      const partialFence = '```ageaf-diagram\n' + diagramBuffer + '\n```\n';
      emitEvent({ event: 'delta', data: { text: partialFence } });
      insideDiagramFence = false;
      diagramBuffer = '';
    }
    if (payloadStarted) return;
    if (!visibleBuffer) return;
    emitEvent({ event: 'delta', data: { text: visibleBuffer } });
    visibleBuffer = '';
  };

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
      (typeof usage?.outputTokens === 'number' ? usage?.outputTokens : 0) +
      (typeof usage?.cacheReadInputTokens === 'number' ? usage?.cacheReadInputTokens : 0) +
      (typeof usage?.cacheCreationInputTokens === 'number' ? usage?.cacheCreationInputTokens : 0);
    const contextWindow =
      typeof usage?.contextWindow === 'number' ? usage?.contextWindow : null;

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
            if (block && typeof block === 'object') {
              const blockType = (block as { type?: unknown }).type;
              // Handle text blocks
              if (blockType === 'text') {
                const text = (block as { text?: unknown }).text;
                if (typeof text === 'string' && text) {
                  emitVisibleDelta(text);
                }
              }
              // Handle thinking blocks (extended thinking feature)
              if (blockType === 'thinking') {
                const thinkingContent = (block as { thinking?: unknown }).thinking;
                if (typeof thinkingContent === 'string' && thinkingContent) {
                  emitEvent({
                    event: 'delta',
                    data: { text: thinkingContent, type: 'thinking' },
                  });
                }
              }
            }
          }
        }
        break;
      }
      case 'stream_event': {
        const event = (message as { event?: any }).event;

        // Detect tool_use content blocks starting - emit plan event for frontend visibility
        if (event?.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          const toolName = event.content_block?.name ?? 'unknown';
          const toolId = event.content_block?.id;
          const toolInput = event.content_block?.input;
          const toolMessages: Record<string, string> = {
            Read: 'Reading file',
            Write: 'Writing file',
            Edit: 'Editing file',
            Bash: 'Running command',
            Grep: 'Searching code',
            Glob: 'Finding files',
            WebSearch: 'Searching web',
            WebFetch: 'Fetching URL',
          };
          const message = toolMessages[toolName] ?? `Running ${toolName}`;

          // Extract displayable input (file path, URL, command, etc.)
          let inputDisplay: string | undefined;
          if (typeof toolInput === 'object' && toolInput !== null) {
            const input = toolInput as Record<string, unknown>;
            inputDisplay =
              (typeof input.file_path === 'string' ? input.file_path : undefined) ??
              (typeof input.path === 'string' ? input.path : undefined) ??
              (typeof input.url === 'string' ? input.url : undefined) ??
              (typeof input.command === 'string' ? input.command : undefined) ??
              (typeof input.query === 'string' ? input.query : undefined) ??
              (typeof input.pattern === 'string' ? input.pattern : undefined);
          }

          emitEvent({
            event: 'plan',
            data: {
              message,
              toolId,
              toolName,
              ...(inputDisplay ? { input: inputDisplay } : {}),
              phase: 'tool_start',
            },
          });
        }



        // Capture thinking deltas (extended thinking content)
        if (event?.type === 'content_block_delta') {
          if (event.delta?.type === 'thinking_delta') {
            // Try multiple possible property names for thinking content
            const thinkingText = String(
              event.delta.thinking ??
              event.delta.text ??
              event.delta.content ??
              ''
            );
            if (thinkingText) {
              emitEvent({
                event: 'delta',
                data: { text: thinkingText, type: 'thinking' },
              });
            }
          }
        }

        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          sawStreamText = true;
          emitVisibleDelta(String(event.delta.text ?? ''));
        }
        if (event?.type === 'content_block_start' && event.content_block?.type === 'text') {
          if (event.content_block.text) {
            sawStreamText = true;
          }
          emitVisibleDelta(String(event.content_block.text ?? ''));
        }
        break;
      }
      case 'result': {
        const resultMessage = message as { subtype?: string; result?: string; structured_output?: unknown };
        resultText = resultMessage.result ?? '';
        flushVisible();
        emitUsage(resultMessage as { modelUsage?: Record<string, unknown> });
        if (structuredOutput) {
          const candidates: unknown[] = [resultMessage.structured_output, resultText].filter(
            (value) => value !== undefined && value !== null
          );
          let parsedPatch: ReturnType<typeof structuredOutput.schema.safeParse> | null = null;
          for (const raw of candidates) {
            let candidate: unknown = raw;
            if (typeof candidate === 'string') {
              candidate = extractJsonObject(candidate);
            }
            const parsed = structuredOutput.schema.safeParse(candidate);
            if (parsed.success) {
              parsedPatch = parsed;
              break;
            }
          }

          if (parsedPatch?.success) {
            emitEvent({ event: 'patch', data: parsedPatch.data });
          } else {
            emitEvent({
              event: 'done',
              data: { status: 'error', message: 'Invalid structured output' },
            });
            doneEmitted = true;
            break;
          }
        } else {
          const patchFence = extractAgeafPatchFence(resultText);
          if (patchFence) {
            const candidate = extractJsonObject(patchFence);
            const parsed = PatchSchema.safeParse(candidate);
            if (parsed.success) {
              emitEvent({ event: 'patch', data: parsed.data });
            }
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

  // CRITICAL: Wipe sensitive env vars from memory after CLI execution
  if (sensitiveKeys.length > 0) {
    for (const key of sensitiveKeys) {
      if (key in customEnv) {
        delete customEnv[key];
        // Overwrite memory (though JS GC will handle it eventually)
        customEnv[key] = '';
      }
      if (key in combinedEnv) {
        const envRecord = combinedEnv as Record<string, string | undefined>;
        delete envRecord[key];
        envRecord[key] = '';
      }
    }
  }

  if (!doneEmitted) {
    emitEvent({ event: 'done', data: { status: 'ok' } });
  }

  return resultText;
}

export async function runClaudeStructuredPatch(input: StructuredPatchInput) {
  if (process.env.AGEAF_CLAUDE_MOCK === 'true') {
    if (input.fallbackPatch) {
      input.emitEvent({ event: 'patch', data: input.fallbackPatch });
    }
    input.emitEvent({ event: 'done', data: { status: 'ok' } });
    return;
  }

  let doneEmitted = false;
  let patched = false;
  const wrappedEmit: EmitEvent = (event) => {
    if (doneEmitted) return;
    if (event.event === 'patch') {
      patched = true;
      input.emitEvent(event);
      return;
    }
    if (
      event.event === 'done' &&
      (event as { data?: any }).data?.status === 'error' &&
      (event as { data?: any }).data?.message === 'Invalid structured output'
    ) {
      // Graceful fallback: keep the selection unchanged instead of failing the UX.
      if (!patched && input.fallbackPatch) {
        input.emitEvent({ event: 'patch', data: input.fallbackPatch });
      }
      input.emitEvent({ event: 'done', data: { status: 'ok' } });
      doneEmitted = true;
      return;
    }
    if (event.event === 'done') {
      doneEmitted = true;
    }
    input.emitEvent(event);
  };

  await runQuery(
    input.prompt,
    wrappedEmit,
    input.runtime ?? {},
    { schema: PatchSchema, name: 'patch' },
    input.safety,
    input.enableTools
  );
}

export async function runClaudeText(input: TextRunInput): Promise<string | null> {
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
    return 'Mock response.';
  }

  return await runQuery(
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
