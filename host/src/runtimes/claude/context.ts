import { query } from '@anthropic-ai/claude-agent-sdk';

import { getClaudeSessionCwd } from './cwd.js';
import { getEnhancedPath, parseEnvironmentVariables, resolveClaudeCliPath } from './cli.js';
import type { ClaudeRuntimeConfig } from './agent.js';

export type ClaudeContextUsage = {
  configured: boolean;
  model: string | null;
  usedTokens: number;
  contextWindow: number | null;
  percentage: number | null;
};

function parseCompactTokenCount(value: string): number | null {
  const trimmed = value.trim().toLowerCase().replace(/,/g, '');
  const match = trimmed.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!match) return null;

  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;

  const unit = match[2];
  const multiplier = unit === 'm' ? 1_000_000 : unit === 'k' ? 1_000 : 1;
  return Math.round(base * multiplier);
}

function parseContextMarkdown(markdown: string): Omit<ClaudeContextUsage, 'configured'> | null {
  const modelMatch = markdown.match(/(?:\*\*Model:\*\*|Model:)\s*([^\s]+)/i);
  const model = modelMatch?.[1] ?? null;

  const tokenMatch = markdown.match(
    /(?:\*\*Tokens:\*\*|Tokens:)\s*([0-9.,]+[kKmM]?)\s*\/\s*([0-9.,]+[kKmM]?)(?:\s*\((\d+)%\))?/i
  );
  if (!tokenMatch) return null;

  const usedTokens = parseCompactTokenCount(tokenMatch[1]);
  const contextWindow = parseCompactTokenCount(tokenMatch[2]);
  const percentage = tokenMatch[3] ? Number(tokenMatch[3]) : null;

  if (usedTokens === null) return null;
  if (contextWindow === null) return null;
  if (percentage !== null && !Number.isFinite(percentage)) return null;

  return {
    model,
    usedTokens,
    contextWindow,
    percentage:
      percentage ??
      (contextWindow > 0 ? Math.round((usedTokens / contextWindow) * 100) : null),
  };
}

function stripLocalCommandStdout(value: string): string {
  return value
    .replace(/<local-command-stdout>/g, '')
    .replace(/<\/local-command-stdout>/g, '')
    .trim();
}

export async function getClaudeContextUsage(
  runtime?: ClaudeRuntimeConfig
): Promise<ClaudeContextUsage> {
  if (process.env.AGEAF_CLAUDE_MOCK === 'true') {
    return {
      configured: true,
      model: 'mock',
      usedTokens: 1200,
      contextWindow: 200000,
      percentage: 1,
    };
  }

  const customEnv = parseEnvironmentVariables(runtime?.envVars ?? '');
  const resolvedCliPath = resolveClaudeCliPath(runtime?.cliPath, customEnv.PATH);
  const combinedEnv = {
    ...process.env,
    ...customEnv,
    PATH: getEnhancedPath(customEnv.PATH, resolvedCliPath ?? runtime?.cliPath),
  };

  const apiKey =
    customEnv.ANTHROPIC_API_KEY ??
    customEnv.ANTHROPIC_AUTH_TOKEN ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.ANTHROPIC_AUTH_TOKEN;

  if (!resolvedCliPath && !apiKey) {
    return {
      configured: false,
      model: null,
      usedTokens: 0,
      contextWindow: null,
      percentage: null,
    };
  }

  const configuredModel =
    runtime?.model ??
    customEnv.ANTHROPIC_MODEL ??
    process.env.ANTHROPIC_MODEL;

  try {
    const response = query({
      prompt: '/context',
      options: {
        ...(configuredModel ? { model: configuredModel } : {}),
        cwd: getClaudeSessionCwd(runtime),
        continue: true,
        permissionMode: 'default',
        pathToClaudeCodeExecutable: resolvedCliPath ?? undefined,
        includePartialMessages: true,
        canUseTool: async () => ({
          behavior: 'deny',
          message: 'Tools disabled for Ageaf host runtime',
        }),
        settingSources: runtime?.loadUserSettings ? ['user', 'project'] : ['project'],
        env: combinedEnv,
      },
    });

    for await (const message of response) {
      if (message.type !== 'user') continue;
      const content = (message as { message?: { content?: unknown } }).message?.content;
      if (typeof content !== 'string') continue;
      if (!content.includes('<local-command-stdout>')) continue;

      const parsed = parseContextMarkdown(stripLocalCommandStdout(content));
      if (parsed) {
        return {
          configured: true,
          ...parsed,
        };
      }
    }
  } catch {
    // fall through to unavailable response
  }

  return {
    configured: true,
    model: null,
    usedTokens: 0,
    contextWindow: null,
    percentage: null,
  };
}
