import type { AgentTool } from '@mariozechner/pi-agent-core';

/**
 * Catalog entry for a registered tool — used by the skills system
 * to match allowed-tools from skill frontmatter and by the prompt
 * builder to generate tool guidance.
 */
export interface ToolCatalogEntry {
  /** Full tool name as seen by the LLM, e.g. "mcp__ageaf-mermaid__render_mermaid" or "web_search" */
  name: string;
  /** Human-readable label */
  label: string;
  /** One-line description for system prompt guidance */
  description: string;
  /** Backend source, e.g. "mcp:ageaf-mermaid" or "builtin" */
  source: string;
}

/**
 * A tool backend provides a set of AgentTool instances and a catalog
 * for prompt/skills integration. `getCatalog()` and `getAgentTools()`
 * are sync after `init()` completes.
 */
export interface ToolBackend {
  /** Async initialization (MCP handshake, etc.) */
  init(): Promise<void>;
  /** Returns the catalog entries (sync after init) */
  getCatalog(): ToolCatalogEntry[];
  /** Returns AgentTool instances (sync after init) */
  getAgentTools(): AgentTool<any>[];
  /** Graceful shutdown — must be safe to call even if init() failed partway */
  shutdown(): Promise<void>;
}
