import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

let beautifulMermaid: typeof import('beautiful-mermaid') | null = null;

async function loadBeautifulMermaid() {
  if (!beautifulMermaid) {
    beautifulMermaid = await import('beautiful-mermaid');
  }
  return beautifulMermaid;
}

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
        const lib = await loadBeautifulMermaid();
        const format = args.format ?? 'svg';

        try {
          if (format === 'ascii') {
            const ascii = lib.renderMermaidAscii(args.code);
            return { content: [{ type: 'text' as const, text: ascii }] };
          }

          const themeName = args.theme ?? 'zinc-dark';
          const themeColors =
            lib.THEMES[themeName] ?? lib.THEMES['zinc-dark'];
          const svg = await lib.renderMermaid(args.code, {
            ...themeColors,
            transparent: false,
          });
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
        const lib = await loadBeautifulMermaid();
        const themes = Object.keys(lib.THEMES);
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
