import { getProviders, getModels, getEnvApiKey, supportsXhigh } from '@mariozechner/pi-ai';
import { getAllCustomModels } from './customProviders.js';
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';

export type PiModelInfo = {
  value: string;
  displayName: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
};

export type PiRuntimeMetadata = {
  models: PiModelInfo[];
  currentModel: string | null;
  currentProvider: string | null;
  thinkingLevels: Array<{ id: ThinkingLevel; label: string }>;
  currentThinkingLevel: ThinkingLevel;
};

const BASE_THINKING_LEVELS: Array<{ id: ThinkingLevel; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

const XHIGH_LEVEL: { id: ThinkingLevel; label: string } = { id: 'xhigh', label: 'Ultra' };

export function getPiAvailableModels(): PiModelInfo[] {
  const providers = getProviders();
  const models: PiModelInfo[] = [];

  for (const provider of providers) {
    if (!getEnvApiKey(provider)) continue;

    try {
      const providerModels = getModels(provider);
      for (const model of providerModels) {
        models.push({
          value: model.id,
          displayName: model.name,
          provider: model.provider,
          reasoning: model.reasoning,
          contextWindow: model.contextWindow,
        });
      }
    } catch {
      // Skip providers that fail to enumerate models
    }
  }

  for (const model of getAllCustomModels()) {
    models.push({
      value: model.id,
      displayName: model.name,
      provider: model.provider,
      reasoning: model.reasoning,
      contextWindow: model.contextWindow,
    });
  }

  return models;
}

export function getPiThinkingLevels(activeModelId?: string | null): Array<{ id: ThinkingLevel; label: string }> {
  if (!activeModelId) return BASE_THINKING_LEVELS;

  // Check if active model supports xhigh
  const providers = getProviders();
  for (const provider of providers) {
    if (!getEnvApiKey(provider)) continue;
    try {
      const providerModels = getModels(provider);
      const model = providerModels.find((m) => m.id === activeModelId);
      if (model && supportsXhigh(model)) {
        return [...BASE_THINKING_LEVELS, XHIGH_LEVEL];
      }
    } catch {
      // Skip
    }
  }

  return BASE_THINKING_LEVELS;
}
