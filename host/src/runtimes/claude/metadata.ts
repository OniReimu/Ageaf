import { query, type ModelInfo } from '@anthropic-ai/claude-agent-sdk';

import { getClaudeSessionCwd } from './cwd.js';
import { parseEnvironmentVariables, resolveClaudeCliPath, getEnhancedPath } from './cli.js';
import type { ClaudeRuntimeConfig } from './agent.js';

const FALLBACK_MODELS: ModelInfo[] = [
  {
    value: 'sonnet',
    displayName: 'Sonnet',
    description: 'Best for everyday task',
  },
  {
    value: 'opus',
    displayName: 'Opus',
    description: 'Most capable for complex work',
  },
  {
    value: 'haiku',
    displayName: 'Haiku',
    description: 'Fastest for quick answers',
  },
];

const KNOWN_MODEL_TOKENS = ['sonnet', 'opus', 'haiku'];

function buildRuntimeEnv(runtime?: ClaudeRuntimeConfig) {
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

  return {
    combinedEnv,
    resolvedCliPath,
    apiKey,
  };
}

function matchesToken(model: ModelInfo, token: string) {
  const lowerToken = token.toLowerCase();
  return (
    model.value.toLowerCase().includes(lowerToken) ||
    model.displayName.toLowerCase().includes(lowerToken)
  );
}

function filterKnownModels(models: ModelInfo[]) {
  const filtered: ModelInfo[] = [];

  for (const token of KNOWN_MODEL_TOKENS) {
    const match = models.find((model) => matchesToken(model, token));
    if (match) {
      filtered.push(match);
    } else {
      const fallback = FALLBACK_MODELS.find((model) => matchesToken(model, token));
      if (fallback) {
        filtered.push(fallback);
      }
    }
  }

  return filtered.length > 0 ? filtered : FALLBACK_MODELS;
}

export async function getClaudeSupportedModels(
  runtime?: ClaudeRuntimeConfig
): Promise<ModelInfo[]> {
  if (process.env.AGEAF_CLAUDE_MOCK === 'true') {
    return FALLBACK_MODELS;
  }

  const { combinedEnv, resolvedCliPath, apiKey } = buildRuntimeEnv(runtime);
  if (!resolvedCliPath && !apiKey) {
    return FALLBACK_MODELS;
  }

  try {
    const response = query({
      prompt: 'List available models.',
      options: {
        cwd: getClaudeSessionCwd(runtime),
        permissionMode: 'default',
        pathToClaudeCodeExecutable: resolvedCliPath ?? undefined,
        settingSources: runtime?.loadUserSettings ? ['user', 'project'] : ['project'],
        env: combinedEnv,
      },
    });

    const models = await response.supportedModels();
    if (Array.isArray(models) && models.length > 0) {
      return filterKnownModels(models);
    }
  } catch {
    // fall through to fallback
  }

  return FALLBACK_MODELS;
}
