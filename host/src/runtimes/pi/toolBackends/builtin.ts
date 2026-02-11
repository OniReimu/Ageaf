import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ToolBackend, ToolCatalogEntry } from './types.js';
import { createWebSearchTool, createWebFetchTool } from '../tools.js';

export function createBuiltinBackend(): ToolBackend {
  let catalog: ToolCatalogEntry[] = [];
  let agentTools: AgentTool<any>[] = [];

  return {
    async init() {
      const webSearch = createWebSearchTool();
      const webFetch = createWebFetchTool();

      agentTools = [webSearch, webFetch];
      catalog = agentTools.map((t) => ({
        name: t.name,
        label: t.label ?? t.name,
        description: t.description ?? '',
        source: 'builtin',
      }));
    },

    getCatalog() { return catalog; },
    getAgentTools() { return agentTools; },

    async shutdown() {
      catalog = [];
      agentTools = [];
    },
  };
}
