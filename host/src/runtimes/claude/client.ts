import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseEnvironmentVariables, resolveClaudeCliPath } from './cli.js';
import type { ClaudeRuntimeConfig } from './agent.js';

export type ClaudeRuntimeStatus = {
  configured: boolean;
  cliPath: string | null;
  usingApiKey: boolean;
  mock: boolean;
  model: string | null;
  modelSource: 'runtime' | 'env' | 'claude_settings' | 'default' | 'unknown';
};

type ClaudeUserSettings = {
  model?: string;
};

function readClaudeUserSettingsModel(settingsPath: string): string | null {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as ClaudeUserSettings;
    return typeof parsed.model === 'string' && parsed.model.trim()
      ? parsed.model.trim()
      : null;
  } catch {
    return null;
  }
}

export function getClaudeRuntimeStatus(config?: ClaudeRuntimeConfig): ClaudeRuntimeStatus {
  const customEnv = parseEnvironmentVariables(config?.envVars ?? '');
  const cliPath = resolveClaudeCliPath(config?.cliPath, customEnv.PATH);
  const apiKey =
    customEnv.ANTHROPIC_API_KEY ??
    customEnv.ANTHROPIC_AUTH_TOKEN ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.ANTHROPIC_AUTH_TOKEN;

  const envModel =
    customEnv.ANTHROPIC_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    null;

  const runtimeModel =
    config?.model && config.model.trim() ? config.model.trim() : null;

  const shouldReadUserSettings =
    config?.loadUserSettings !== false;

  let settingsModel: string | null = null;
  if (shouldReadUserSettings) {
    const settingsPath =
      process.env.AGEAF_CLAUDE_USER_SETTINGS_PATH ??
      path.join(os.homedir(), '.claude', 'settings.json');
    settingsModel = readClaudeUserSettingsModel(settingsPath);
  }

  const model =
    runtimeModel ??
    envModel ??
    settingsModel ??
    null;

  const modelSource: ClaudeRuntimeStatus['modelSource'] = runtimeModel
    ? 'runtime'
    : envModel
      ? 'env'
      : settingsModel
        ? 'claude_settings'
        : 'default';

  return {
    configured: Boolean(cliPath || apiKey),
    cliPath,
    usingApiKey: Boolean(apiKey),
    mock: process.env.AGEAF_CLAUDE_MOCK === 'true',
    model,
    modelSource,
  };
}
