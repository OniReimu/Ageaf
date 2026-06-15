import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ToolBackend, ToolCatalogEntry } from './toolBackends/types.js';
import { createMcpMermaidBackend } from './toolBackends/mcp.js';
import { createBuiltinBackend } from './toolBackends/builtin.js';
import { createSkillDiscoveryBackend } from './toolBackends/skillDiscovery.js';
import { createAskUserBackend } from './toolBackends/askUser.js';

type State = 'idle' | 'initializing' | 'ready' | 'shutting-down';

let state: State = 'idle';
let initPromise: Promise<void> | null = null;
let shutdownPromise: Promise<void> | null = null;
let backends: ToolBackend[] = [];
let liveBackends: ToolBackend[] = [];
let failedBackends: ToolBackend[] = [];

function createBackends(): ToolBackend[] {
  return [
    createMcpMermaidBackend(),
    createBuiltinBackend(),
    createAskUserBackend(),
    createSkillDiscoveryBackend(),
  ];
}

async function initBackends(toInit: ToolBackend[]): Promise<void> {
  const results = await Promise.allSettled(toInit.map((b) => b.init()));

  for (let i = 0; i < toInit.length; i++) {
    const result = results[i]!;
    const backend = toInit[i]!;
    if (result.status === 'fulfilled') {
      if (!liveBackends.includes(backend)) {
        liveBackends.push(backend);
      }
      // Remove from failedBackends if it was retried successfully
      const idx = failedBackends.indexOf(backend);
      if (idx >= 0) failedBackends.splice(idx, 1);
    } else {
      console.warn(
        `[Pi toolRuntime] Backend init failed (non-fatal):`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
      if (!failedBackends.includes(backend)) {
        failedBackends.push(backend);
      }
    }
  }
}

function resetAll(): void {
  state = 'idle';
  initPromise = null;
  shutdownPromise = null;
  backends = [];
  liveBackends = [];
  failedBackends = [];
}

export async function initToolRuntime(): Promise<void> {
  // Already ready with no failures — fast path
  if (state === 'ready' && failedBackends.length === 0) return;

  // Ready but some backends failed — retry only the failed ones
  if (state === 'ready' && failedBackends.length > 0) {
    const toRetry = [...failedBackends];
    await initBackends(toRetry);
    return;
  }

  // Already initializing — share the in-flight promise
  if (state === 'initializing' && initPromise) return initPromise;

  // Fresh init
  state = 'initializing';
  initPromise = (async () => {
    try {
      backends = createBackends();
      await initBackends(backends);
      state = 'ready';
    } catch (err) {
      // Fatal error in backend creation itself (before allSettled)
      resetAll();
      throw err;
    } finally {
      // Clear initPromise so it's not held after resolution
      initPromise = null;
    }
  })();

  return initPromise;
}

export function getToolCatalog(): ToolCatalogEntry[] {
  if (state !== 'ready') {
    throw new Error('toolRuntime not initialized — call initToolRuntime() first');
  }
  return liveBackends.flatMap((b) => b.getCatalog());
}

export function getAllAgentTools(): AgentTool<any>[] {
  if (state !== 'ready') {
    throw new Error('toolRuntime not initialized — call initToolRuntime() first');
  }
  return liveBackends.flatMap((b) => b.getAgentTools());
}

export async function shutdownToolRuntime(): Promise<void> {
  if (state === 'idle') return;
  if (state === 'shutting-down' && shutdownPromise) return shutdownPromise;

  // If still initializing, wait for it to finish so we can clean up
  if (state === 'initializing' && initPromise) {
    try { await initPromise; } catch { /* ignore init errors during shutdown */ }
  }

  state = 'shutting-down';
  shutdownPromise = (async () => {
    // Shut down all backends (including failed ones that may hold partial resources)
    await Promise.allSettled(backends.map((b) => b.shutdown()));
    resetAll();
  })();

  return shutdownPromise;
}
