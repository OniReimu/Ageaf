import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getCodexAppServer } from './appServer.js';

export type CodexContextUsage = {
  configured: boolean;
  model: string | null;
  usedTokens: number;
  contextWindow: number | null;
  percentage: number | null;
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

function parseTokenUsage(payload: any): { usedTokens: number; contextWindow: number | null } | null {
  const raw = payload?.tokenUsage ?? payload?.token_usage;
  if (!raw || typeof raw !== 'object') return null;
  const total = (raw as any).total ?? {};
  const usedTokens = Number(total.totalTokens ?? total.total_tokens ?? 0);
  const contextWindowRaw = (raw as any).modelContextWindow ?? (raw as any).model_context_window;
  const contextWindow = Number(contextWindowRaw ?? 0) || null;
  if (!Number.isFinite(usedTokens)) return null;
  return { usedTokens, contextWindow };
}

function computePercentage(usedTokens: number, contextWindow: number | null): number | null {
  if (!contextWindow || contextWindow <= 0) return null;
  return Math.round((usedTokens / contextWindow) * 100);
}

export async function getCodexContextUsage(config: {
  cliPath?: string;
  envVars?: string;
  threadId?: string;
}): Promise<CodexContextUsage> {
  // Deterministic response for tests/dev without requiring Codex CLI.
  if (process.env.AGEAF_CODEX_MOCK === 'true') {
    return {
      configured: true,
      model: null,
      usedTokens: 1200,
      contextWindow: 200000,
      percentage: 1,
    };
  }

  const cwd = ensureAgeafWorkspaceCwd();
  const appServer = await getCodexAppServer({
    cliPath: config.cliPath,
    envVars: config.envVars,
    cwd,
  });

  const threadId = typeof config.threadId === 'string' ? config.threadId.trim() : '';

  // We don't have a stable documented JSON-RPC method for "slash status" yet.
  // Try a small set of likely methods, and fall back to returning "unknown".
  const candidates: Array<{ method: string; params: any }> = [
    { method: 'thread/tokenUsage/get', params: threadId ? { threadId } : {} },
    { method: 'thread/getTokenUsage', params: threadId ? { threadId } : {} },
    { method: 'thread/status', params: threadId ? { threadId } : {} },
    { method: 'status', params: threadId ? { threadId } : {} },
  ];

  for (const candidate of candidates) {
    try {
      const response = await appServer.request(candidate.method, candidate.params);
      if ((response as any).error) continue;
      const usage =
        parseTokenUsage((response as any).result) ??
        parseTokenUsage(response as any) ??
        null;
      if (usage) {
        return {
          configured: true,
          model: null,
          usedTokens: usage.usedTokens,
          contextWindow: usage.contextWindow,
          percentage: computePercentage(usage.usedTokens, usage.contextWindow),
        };
      }
    } catch {
      // try next candidate
    }
  }

  return {
    configured: true,
    model: null,
    usedTokens: 0,
    contextWindow: null,
    percentage: null,
  };
}


