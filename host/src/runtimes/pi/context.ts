import type { Usage } from '@mariozechner/pi-ai';

export type PiContextUsage = {
  configured: boolean;
  model: string | null;
  usedTokens: number;
  contextWindow: number | null;
  percentage: number | null;
};

type CumulativeUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  model: string | null;
  contextWindow: number | null;
};

const usageByConversation = new Map<string, CumulativeUsage>();

function getOrCreate(conversationId: string): CumulativeUsage {
  let usage = usageByConversation.get(conversationId);
  if (!usage) {
    usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      model: null,
      contextWindow: null,
    };
    usageByConversation.set(conversationId, usage);
  }
  return usage;
}

export function addPiUsage(
  conversationId: string,
  usage: Usage,
  model?: string,
  contextWindow?: number,
): void {
  const cumulative = getOrCreate(conversationId);
  cumulative.input += usage.input;
  cumulative.output += usage.output;
  cumulative.cacheRead += usage.cacheRead;
  cumulative.cacheWrite += usage.cacheWrite;
  cumulative.totalTokens += usage.totalTokens;
  if (model) cumulative.model = model;
  if (typeof contextWindow === 'number' && contextWindow > 0) {
    cumulative.contextWindow = contextWindow;
  }
}

export function getPiContextUsage(conversationId: string): PiContextUsage {
  const cumulative = usageByConversation.get(conversationId);
  if (!cumulative) {
    return {
      configured: true,
      model: null,
      usedTokens: 0,
      contextWindow: null,
      percentage: null,
    };
  }

  const usedTokens = cumulative.totalTokens;
  const contextWindow = cumulative.contextWindow;
  const percentage =
    contextWindow && contextWindow > 0
      ? Math.round((usedTokens / contextWindow) * 100)
      : null;

  return {
    configured: true,
    model: cumulative.model,
    usedTokens,
    contextWindow,
    percentage,
  };
}

export function clearPiUsage(conversationId: string): void {
  usageByConversation.delete(conversationId);
}
