/**
 * Standalone MCP stdio server for ask_user interaction.
 * Used by Codex CLI — spawned as a child process via:
 *   node dist/src/mcp/askUserStdioServer.js
 *
 * Unlike the in-process Pi/Claude handlers, this server communicates
 * with the host via an HTTP callback because it runs in a separate
 * process without access to AsyncLocalStorage job context.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ASK_USER_SERVER_NAME,
  ASK_USER_SERVER_VERSION,
  ASK_USER_TOOL_NAME,
  ASK_USER_TOOL_DESC,
  askUserSchema,
} from './askUserToolDefs.js';

const HOST_PORT = process.env.AGEAF_HOST_PORT || '3210';

const server = new McpServer({
  name: ASK_USER_SERVER_NAME,
  version: ASK_USER_SERVER_VERSION,
});

server.tool(ASK_USER_TOOL_NAME, ASK_USER_TOOL_DESC, askUserSchema, async (args) => {
  try {
    const res = await fetch(`http://127.0.0.1:${HOST_PORT}/v1/internal/ask-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: args.questions, ppid: process.ppid }),
      signal: AbortSignal.timeout(5 * 60 * 1000), // 5-minute timeout
    });

    if (!res.ok) {
      const text = await res.text();
      return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
    }

    const result = (await res.json()) as { answers?: Record<string, { answers?: string[] }> };

    const lines: string[] = [];
    for (const q of args.questions) {
      const a = result.answers?.[q.id];
      const answer = a?.answers?.length ? a.answers.join(', ') : '(skipped)';
      lines.push(`${q.question}: ${answer}`);
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'ask_user failed';
    return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
