import type { ThinkingLevel } from '@mariozechner/pi-agent-core';

export type PiPreferences = {
  provider: string | null;
  model: string | null;
  thinkingLevel: ThinkingLevel;
};

const VALID_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh',
] as const;

const preferences: PiPreferences = {
  provider: null,
  model: null,
  thinkingLevel: 'off',
};

export function getPiPreferences(): PiPreferences {
  return { ...preferences };
}

export function updatePiPreferences(input: {
  provider?: string | null;
  model?: string | null;
  thinkingLevel?: string | null;
}): PiPreferences {
  if (input.provider !== undefined) {
    preferences.provider = input.provider && input.provider.trim() ? input.provider.trim() : null;
  }

  if (input.model !== undefined) {
    preferences.model = input.model && input.model.trim() ? input.model.trim() : null;
  }

  if (input.thinkingLevel !== undefined) {
    const level = input.thinkingLevel?.trim()?.toLowerCase() ?? 'off';
    if (VALID_THINKING_LEVELS.includes(level as ThinkingLevel)) {
      preferences.thinkingLevel = level as ThinkingLevel;
    }
  }

  return getPiPreferences();
}
