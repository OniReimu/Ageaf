import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ToolBackend, ToolCatalogEntry } from './types.js';
import { executeAskUser, type AskUserQuestion } from '../../../interactive/askUserCore.js';

export function createAskUserBackend(): ToolBackend {
  let catalog: ToolCatalogEntry[] = [];
  let agentTools: AgentTool<any>[] = [];

  return {
    async init() {
      const askUserTool: AgentTool<any> = {
        name: 'ask_user',
        label: 'Ask User',
        description: 'Ask the user structured questions with optional clickable options. Each question also accepts free-text input.',
        parameters: Type.Object({
          questions: Type.Array(Type.Object({
            id: Type.String(),
            header: Type.Optional(Type.String()),
            question: Type.String(),
            options: Type.Optional(Type.Array(Type.Object({
              label: Type.String(),
              description: Type.Optional(Type.String()),
            }))),
          })),
        }),
        async execute(_toolCallId, params, signal) {
          // jobId is read from AsyncLocalStorage inside executeAskUser()
          const result = await executeAskUser(params.questions as AskUserQuestion[], signal);

          // Format answers as readable text for the LLM
          const lines: string[] = [];
          for (const q of params.questions as AskUserQuestion[]) {
            const a = result.answers[q.id];
            const answer = a?.answers?.length ? a.answers.join(', ') : '(skipped)';
            lines.push(`${q.question}: ${answer}`);
          }

          return {
            content: [{ type: 'text' as const, text: lines.join('\n') }],
            details: {},
          };
        },
      };

      agentTools = [askUserTool];
      catalog = [{ name: 'ask_user', label: 'Ask User', description: askUserTool.description!, source: 'builtin' }];
    },
    getCatalog() { return catalog; },
    getAgentTools() { return agentTools; },
    async shutdown() { catalog = []; agentTools = []; },
  };
}
