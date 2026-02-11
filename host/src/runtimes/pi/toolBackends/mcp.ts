import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Type } from '@mariozechner/pi-ai';
import type { TSchema } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ToolBackend, ToolCatalogEntry } from './types.js';
import {
  MERMAID_SERVER_NAME,
  MERMAID_SERVER_VERSION,
  registerMermaidTools,
} from '../../../mcp/mermaidToolDefs.js';

/**
 * Wraps a JSON Schema object as a TypeBox TSchema using Type.Unsafe().
 * MCP tool inputSchema is standard JSON Schema; pi-agent-core expects TypeBox.
 * TypeBox schemas ARE JSON Schema, so Unsafe() passes them through verbatim.
 */
function jsonSchemaToTypebox(inputSchema: Record<string, unknown>): TSchema {
  return Type.Unsafe(inputSchema as any);
}

export function createMcpMermaidBackend(): ToolBackend {
  let client: Client | null = null;
  let mcpServer: McpServer | null = null;
  let catalog: ToolCatalogEntry[] = [];
  let agentTools: AgentTool<any>[] = [];

  return {
    async init() {
      mcpServer = new McpServer({
        name: MERMAID_SERVER_NAME,
        version: MERMAID_SERVER_VERSION,
      });
      registerMermaidTools(mcpServer);

      client = new Client(
        { name: 'pi-mcp-client', version: '1.0.0' },
      );

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([
        client.connect(clientTransport),
        mcpServer.connect(serverTransport),
      ]);

      // Discover tools from the MCP server
      const { tools } = await client.listTools();

      const capturedClient = client;
      catalog = tools.map((t) => ({
        name: `mcp__${MERMAID_SERVER_NAME}__${t.name}`,
        label: t.name.replace(/_/g, ' '),
        description: t.description ?? '',
        source: `mcp:${MERMAID_SERVER_NAME}`,
      }));

      agentTools = tools.map((t) => {
        const prefixedName = `mcp__${MERMAID_SERVER_NAME}__${t.name}`;
        const parameters = jsonSchemaToTypebox(t.inputSchema);
        const originalName = t.name;

        const tool: AgentTool<any> = {
          name: prefixedName,
          label: t.name.replace(/_/g, ' '),
          description: t.description ?? '',
          parameters,
          async execute(_toolCallId, params) {
            const result = await capturedClient.callTool({
              name: originalName,
              arguments: params,
            });

            // MCP-level error — throw so pi-agent-core marks result as error
            if ('isError' in result && result.isError) {
              const errorText = (result.content as any[])
                ?.filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n') ?? 'MCP tool error';
              throw new Error(errorText);
            }

            // Convert MCP content to AgentToolResult content
            const content = ((result.content ?? []) as any[])
              .map((c: any) => {
                if (c.type === 'text') return { type: 'text' as const, text: c.text };
                if (c.type === 'image') return { type: 'image' as const, data: c.data, mimeType: c.mimeType };
                return null;
              })
              .filter(Boolean) as { type: 'text'; text: string }[];

            return { content, details: {} };
          },
        };
        return tool;
      });
    },

    getCatalog() { return catalog; },
    getAgentTools() { return agentTools; },

    async shutdown() {
      try { await client?.close(); } catch { /* ignore */ }
      try { await mcpServer?.close(); } catch { /* ignore */ }
      client = null;
      mcpServer = null;
      catalog = [];
      agentTools = [];
    },
  };
}
