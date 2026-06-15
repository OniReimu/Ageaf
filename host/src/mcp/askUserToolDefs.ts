import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeAskUser, type AskUserQuestion } from '../interactive/askUserCore.js';

export const ASK_USER_SERVER_NAME = 'ageaf-interactive';
export const ASK_USER_SERVER_VERSION = '1.0.0';

export const ASK_USER_TOOL_NAME = 'ask_user';
export const ASK_USER_TOOL_DESC =
  'Ask the user structured questions with optional clickable options. Each question also accepts free-text input. Returns answers keyed by question ID.';

export const askUserSchema = {
  questions: z.array(z.object({
    id: z.string().describe('Unique identifier for the question'),
    header: z.string().optional().describe('Optional heading above the question'),
    question: z.string().describe('The question text'),
    options: z.array(z.object({
      label: z.string().describe('Option label text'),
      description: z.string().optional(),
    })).optional().describe('Clickable options (user can also type free-text)'),
  })).describe('Array of questions to ask the user'),
};

// No module-level mutable state — jobId comes from AsyncLocalStorage
export async function handleAskUser(args: { questions: AskUserQuestion[] }) {
  try {
    const result = await executeAskUser(args.questions);

    const lines: string[] = [];
    for (const q of args.questions) {
      const a = result.answers[q.id];
      const answer = a?.answers?.length ? a.answers.join(', ') : '(skipped)';
      lines.push(`${q.question}: ${answer}`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'ask_user failed';
    return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
  }
}

export function getAskUserSdkTools(toolFn: typeof import('@anthropic-ai/claude-agent-sdk').tool) {
  return [toolFn(ASK_USER_TOOL_NAME, ASK_USER_TOOL_DESC, askUserSchema, handleAskUser)];
}

export function registerAskUserTools(server: McpServer): void {
  server.tool(ASK_USER_TOOL_NAME, ASK_USER_TOOL_DESC, askUserSchema, handleAskUser);
}
