/**
 * Shared Mermaid MCP tool definitions.
 *
 * Single source of truth for tool names, descriptions, schemas, and handlers.
 * Consumed by:
 * - mermaidStdioServer.ts (Codex stdio MCP)
 * - mermaidServer.ts (Claude SDK MCP)
 * - Pi runtime MCP backend (in-process MCP via InMemoryTransport)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { renderMermaidToSvg, renderMermaidToAscii, listMermaidThemes } from './renderMermaid.js';

export const MERMAID_SERVER_NAME = 'ageaf-mermaid';
export const MERMAID_SERVER_VERSION = '1.0.0';

// Shared Zod schemas
export const renderMermaidSchema = {
  code: z.string().describe('Mermaid diagram source code'),
  format: z
    .enum(['svg', 'ascii'])
    .optional()
    .describe('Output format. Defaults to svg'),
  theme: z
    .string()
    .optional()
    .describe(
      'Theme name (e.g. zinc-dark, tokyo-night, catppuccin-mocha, dracula, nord, github-dark, solarized-dark, one-dark). Defaults to zinc-dark',
    ),
};

export const listThemesSchema = {};

// Shared descriptions
export const RENDER_MERMAID_NAME = 'render_mermaid';
export const RENDER_MERMAID_DESC =
  'Render a Mermaid diagram to SVG or ASCII. Supports flowcharts (graph TD/LR), sequence diagrams, state diagrams, class diagrams, and ER diagrams.';

export const LIST_THEMES_NAME = 'list_mermaid_themes';
export const LIST_THEMES_DESC = 'List available Mermaid diagram color themes';

// Shared handlers
export async function handleRenderMermaid(args: {
  code: string;
  format?: 'svg' | 'ascii';
  theme?: string;
}) {
  try {
    if (args.format === 'ascii') {
      const ascii = await renderMermaidToAscii(args.code);
      return { content: [{ type: 'text' as const, text: ascii }] };
    }

    const svg = await renderMermaidToSvg(args.code, args.theme);
    return { content: [{ type: 'text' as const, text: svg }] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Mermaid rendering failed';
    return {
      content: [{ type: 'text' as const, text: `Error rendering diagram: ${message}` }],
      isError: true,
    };
  }
}

export async function handleListThemes() {
  const themes = await listMermaidThemes();
  return {
    content: [{ type: 'text' as const, text: `Available themes: ${themes.join(', ')}` }],
  };
}

/**
 * Tool descriptors for the Claude Agent SDK `createSdkMcpServer()` style.
 * Each entry is a tuple: [name, description, schema, handler].
 */
export const MERMAID_TOOLS = [
  { name: RENDER_MERMAID_NAME, desc: RENDER_MERMAID_DESC, schema: renderMermaidSchema, handler: handleRenderMermaid },
  { name: LIST_THEMES_NAME, desc: LIST_THEMES_DESC, schema: listThemesSchema, handler: handleListThemes },
] as const;

/**
 * Build tool() calls for `createSdkMcpServer()`.
 * Requires the `tool` function from `@anthropic-ai/claude-agent-sdk`.
 */
export function getMermaidSdkTools(toolFn: typeof import('@anthropic-ai/claude-agent-sdk').tool) {
  return MERMAID_TOOLS.map((t) => toolFn(t.name, t.desc, t.schema, t.handler));
}

/**
 * Register mermaid tools on a @modelcontextprotocol/sdk McpServer instance.
 * Used by mermaidStdioServer.ts and the Pi MCP backend.
 */
export function registerMermaidTools(server: McpServer): void {
  for (const t of MERMAID_TOOLS) {
    server.tool(t.name, t.desc, t.schema, t.handler);
  }
}
