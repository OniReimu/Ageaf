import type { ClaudeRuntimeConfig } from './agent.js';

let lastRuntimeConfig: ClaudeRuntimeConfig | null = null;
const sdkSessionByConversation = new Map<string, string>();

export function setLastClaudeRuntimeConfig(runtime?: ClaudeRuntimeConfig) {
  lastRuntimeConfig = runtime ? { ...runtime } : null;
}

export function getLastClaudeRuntimeConfig(): ClaudeRuntimeConfig | null {
  return lastRuntimeConfig ? { ...lastRuntimeConfig } : null;
}

export function setClaudeSdkSessionId(
  conversationId: string | undefined,
  sessionId: string | undefined
) {
  const conv = typeof conversationId === 'string' ? conversationId.trim() : '';
  const sess = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!conv) return;
  if (!sess) {
    sdkSessionByConversation.delete(conv);
    return;
  }
  sdkSessionByConversation.set(conv, sess);
}

export function getClaudeSdkSessionId(
  conversationId: string | undefined
): string | null {
  const conv = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!conv) return null;
  return sdkSessionByConversation.get(conv) ?? null;
}

export function clearClaudeSessionResumeCacheForTests() {
  sdkSessionByConversation.clear();
}
