import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { renderMermaidToSvg, renderMermaidToAscii, listMermaidThemes } from './renderMermaid.js';

export const mermaidMcpServer = createSdkMcpServer({
  name: 'ageaf-mermaid',
  version: '1.0.0',
  tools: [
    tool(
      'render_mermaid',
      'Render a Mermaid diagram to SVG or ASCII. Supports flowcharts (graph TD/LR), sequence diagrams, state diagrams, class diagrams, and ER diagrams.',
      {
        code: z.string().describe('Mermaid diagram source code'),
        format: z
          .enum(['svg', 'ascii'])
          .optional()
          .describe('Output format. Defaults to svg'),
        theme: z
          .string()
          .optional()
          .describe(
            'Theme name (e.g. zinc-dark, tokyo-night, catppuccin-mocha, dracula, nord, github-dark, solarized-dark, one-dark). Defaults to zinc-dark'
          ),
      },
      async (args) => {
        try {
          if (args.format === 'ascii') {
            const ascii = await renderMermaidToAscii(args.code);
            return { content: [{ type: 'text' as const, text: ascii }] };
          }

          const svg = await renderMermaidToSvg(args.code, args.theme);
          return { content: [{ type: 'text' as const, text: svg }] };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Mermaid rendering failed';
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error rendering diagram: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),
    tool(
      'list_mermaid_themes',
      'List available Mermaid diagram color themes',
      {},
      async () => {
        const themes = await listMermaidThemes();
        return {
          content: [
            {
              type: 'text' as const,
              text: `Available themes: ${themes.join(', ')}`,
            },
          ],
        };
      }
    ),
  ],
});
