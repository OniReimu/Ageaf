function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return null;
}

function pickFirstFinite(values: unknown[]): number | null {
  for (const value of values) {
    const asNumber = toFiniteNumber(value);
    if (asNumber === null) continue;
    return asNumber;
  }
  return null;
}

export function parseCodexTokenUsage(payload: unknown): {
  usedTokens: number;
  contextWindow: number | null;
} | null {
  if (!payload || typeof payload !== 'object') return null;

  const container = payload as any;
  const raw = container.tokenUsage ?? container.token_usage ?? container;
  if (!raw || typeof raw !== 'object') return null;

  const total = (raw as any).total ?? {};
  const last = (raw as any).last ?? {};

  const usedTokensRaw = pickFirstFinite([
    // Prioritize 'last' fields which reflect current context usage
    last.contextTokens,
    last.context_tokens,
    last.totalTokens, // Correct field for current turn total usage
    last.total_tokens,
    last.inputTokens,
    last.input_tokens,

    // Fallback to 'total' fields (may be cumulative)
    total.contextTokens,
    total.context_tokens,
    total.promptTokens,
    total.prompt_tokens,
    total.inputTokens,
    total.input_tokens,
    total.totalTokens,
    total.total_tokens,

    // Legacy fields
    (raw as any).contextTokens,
    (raw as any).context_tokens,
    (raw as any).usedTokens,
    (raw as any).used_tokens,
  ]);

  if (usedTokensRaw === null) return null;
  const usedTokens = Math.max(0, Math.floor(usedTokensRaw));

  const contextWindowRaw = pickFirstFinite([
    (raw as any).modelContextWindow,
    (raw as any).model_context_window,
    (raw as any).contextWindow,
    (raw as any).context_window,
  ]);
  const contextWindow =
    contextWindowRaw && Number.isFinite(contextWindowRaw) && contextWindowRaw > 0
      ? Math.floor(contextWindowRaw)
      : null;

  if (!contextWindow) return { usedTokens, contextWindow: null };

  // Some Codex token usage payloads report lifetime token usage for the thread, which can exceed
  // the model context window. Clamp so UI never displays >100% usage.
  return {
    usedTokens: Math.min(usedTokens, contextWindow),
    contextWindow,
  };
}

