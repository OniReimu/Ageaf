/**
 * Standalone MCP stdio server for Mermaid diagram rendering.
 * Used by Codex CLI — spawned as a child process via:
 *   node dist/mcp/mermaidStdioServer.js
 *
 * Exposes the same render_mermaid / list_mermaid_themes tools
 * as the Claude in-process MCP server (mermaidServer.ts).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  MERMAID_SERVER_NAME,
  MERMAID_SERVER_VERSION,
  registerMermaidTools,
} from './mermaidToolDefs.js';

const server = new McpServer({
  name: MERMAID_SERVER_NAME,
  version: MERMAID_SERVER_VERSION,
});

registerMermaidTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
