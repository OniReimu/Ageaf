import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getCodexAppServer } from './appServer.js';

type CodexModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
  defaultReasoningEffort: string;
  isDefault: boolean;
};

type CodexUserSavedConfig = {
  model: string | null;
  modelReasoningEffort: string | null;
};

function ensureAgeafWorkspaceCwd(): string {
  const workspace = path.join(os.homedir(), '.ageaf');
  try {
    fs.mkdirSync(workspace, { recursive: true });
  } catch {
    // ignore workspace creation failures
  }
  return workspace;
}

function getCodexSessionCwd(threadId?: string): string {
  if (!threadId || !threadId.trim()) {
    return ensureAgeafWorkspaceCwd();
  }
  const sessionDir = path.join(os.homedir(), '.ageaf', 'codex', 'sessions', threadId.trim());
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch {
    // ignore directory creation failures
  }
  return sessionDir;
}

function normalizeModel(raw: any): CodexModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id : null;
  const model = typeof raw.model === 'string' ? raw.model : null;
  const displayName = typeof raw.displayName === 'string' ? raw.displayName : model;
  const description = typeof raw.description === 'string' ? raw.description : '';
  const defaultReasoningEffort =
    typeof raw.defaultReasoningEffort === 'string' ? raw.defaultReasoningEffort : 'none';
  const isDefault = Boolean(raw.isDefault);

  if (!id || !model) return null;

  const rawEfforts = Array.isArray(raw.supportedReasoningEfforts)
    ? raw.supportedReasoningEfforts
    : [];
  const supportedReasoningEfforts = rawEfforts
    .map((entry: any) => {
      if (!entry || typeof entry !== 'object') return null;
      const reasoningEffort =
        typeof entry.reasoningEffort === 'string' ? entry.reasoningEffort : null;
      const effortDescription = typeof entry.description === 'string' ? entry.description : '';
      if (!reasoningEffort) return null;
      return { reasoningEffort, description: effortDescription };
    })
    .filter((entry: { reasoningEffort: string; description: string } | null): entry is { reasoningEffort: string; description: string } =>
      Boolean(entry)
    );

  return {
    id,
    model,
    displayName: displayName ?? model,
    description,
    supportedReasoningEfforts,
    defaultReasoningEffort,
    isDefault,
  };
}

async function listCodexModels(config: { cliPath?: string; envVars?: string; cwd: string }) {
  const appServer = await getCodexAppServer(config);
  const models: CodexModel[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 10) {
    pages += 1;
    const response = await appServer.request('model/list', { cursor, limit: 100 });
    if (response.error) {
      throw new Error(String((response as any).error?.message ?? 'Failed to list models'));
    }
    const result = response.result as any;
    const dataRaw = Array.isArray(result?.data) ? result.data : [];
    for (const entry of dataRaw) {
      const normalized = normalizeModel(entry);
      if (normalized) models.push(normalized);
    }
    cursor = typeof result?.nextCursor === 'string' ? result.nextCursor : null;
    if (!cursor) break;
  }

  return models;
}

async function readCodexUserSavedConfig(config: { cliPath?: string; envVars?: string; cwd: string }): Promise<CodexUserSavedConfig> {
  const appServer = await getCodexAppServer(config);
  const response = await appServer.request('getUserSavedConfig', undefined);
  if (response.error) {
    return { model: null, modelReasoningEffort: null };
  }
  const result = response.result as any;
  const rawConfig = result?.config ?? {};
  return {
    model: typeof rawConfig.model === 'string' ? rawConfig.model : null,
    modelReasoningEffort:
      typeof rawConfig.modelReasoningEffort === 'string' ? rawConfig.modelReasoningEffort : null,
  };
}

export async function getCodexRuntimeMetadata(config: { cliPath?: string; envVars?: string }) {
  const cwd = ensureAgeafWorkspaceCwd();
  const appServerConfig = { ...config, cwd };

  const [models, saved] = await Promise.all([
    listCodexModels(appServerConfig),
    readCodexUserSavedConfig(appServerConfig),
  ]);

  const defaultModel = models.find((model) => model.isDefault) ?? models[0] ?? null;

  return {
    models: models.map((model) => ({
      value: model.model,
      displayName: model.displayName,
      description: model.description,
      supportedReasoningEfforts: model.supportedReasoningEfforts,
      defaultReasoningEffort: model.defaultReasoningEffort,
      isDefault: model.isDefault,
    })),
    currentModel: saved.model ?? defaultModel?.model ?? null,
    currentReasoningEffort: saved.modelReasoningEffort ?? defaultModel?.defaultReasoningEffort ?? null,
  };
}

