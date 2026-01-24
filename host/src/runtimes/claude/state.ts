import type { ClaudeRuntimeConfig } from './agent.js';

let lastRuntimeConfig: ClaudeRuntimeConfig | null = null;

export function setLastClaudeRuntimeConfig(runtime?: ClaudeRuntimeConfig) {
  lastRuntimeConfig = runtime ? { ...runtime } : null;
}

export function getLastClaudeRuntimeConfig(): ClaudeRuntimeConfig | null {
  return lastRuntimeConfig ? { ...lastRuntimeConfig } : null;
}

