export type ThinkingModeId = 'off' | 'low' | 'medium' | 'high' | 'ultra';

export type ThinkingMode = {
  id: ThinkingModeId;
  label: string;
  maxThinkingTokens: number | null;
};

const THINKING_MODES: ThinkingMode[] = [
  { id: 'off', label: 'Off', maxThinkingTokens: null },
  { id: 'low', label: 'Low', maxThinkingTokens: 1024 },
  { id: 'medium', label: 'Medium', maxThinkingTokens: 4096 },
  { id: 'high', label: 'High', maxThinkingTokens: 8192 },
  { id: 'ultra', label: 'Ultra', maxThinkingTokens: 16384 },
];

type Preferences = {
  model: string | null;
  thinkingMode: ThinkingModeId;
};

const preferences: Preferences = {
  model: 'sonnet',
  thinkingMode: 'off',
};

export function getThinkingModes(): ThinkingMode[] {
  return THINKING_MODES;
}

export function getThinkingModeById(id: string | null | undefined): ThinkingMode {
  const match = THINKING_MODES.find((mode) => mode.id === id);
  return match ?? THINKING_MODES[0];
}

export function getClaudePreferences() {
  const mode = getThinkingModeById(preferences.thinkingMode);
  return {
    model: preferences.model,
    thinkingMode: preferences.thinkingMode,
    maxThinkingTokens: mode.maxThinkingTokens,
  };
}

export function updateClaudePreferences(input: {
  model?: string | null;
  thinkingMode?: string | null;
}) {
  if (input.model !== undefined) {
    preferences.model = input.model && input.model.trim() ? input.model.trim() : null;
  }

  if (input.thinkingMode !== undefined) {
    const mode = getThinkingModeById(input.thinkingMode);
    preferences.thinkingMode = mode.id;
  }

  return getClaudePreferences();
}
