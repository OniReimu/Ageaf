import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import {
  renderMermaidToSvg,
  renderMermaidToAscii,
  listMermaidThemes,
} from '../../mcp/renderMermaid.js';

const RenderMermaidParams = Type.Object({
  code: Type.String({ description: 'Mermaid diagram source code' }),
  format: Type.Optional(
    Type.Union([Type.Literal('svg'), Type.Literal('ascii')], {
      description: 'Output format: "svg" (default) or "ascii"',
    }),
  ),
  theme: Type.Optional(
    Type.String({ description: 'Theme name for SVG output (default: "zinc-dark")' }),
  ),
});

const ListThemesParams = Type.Object({});

export function createMermaidTools(): AgentTool<any>[] {
  const renderMermaid: AgentTool<typeof RenderMermaidParams> = {
    name: 'render_mermaid',
    label: 'Render Mermaid Diagram',
    description:
      'Render a Mermaid diagram to SVG or ASCII art. Supports flowcharts, sequence diagrams, state diagrams, class diagrams, and ER diagrams.',
    parameters: RenderMermaidParams,
    async execute(_toolCallId, params) {
      const format = params.format ?? 'svg';
      const result =
        format === 'ascii'
          ? await renderMermaidToAscii(params.code)
          : await renderMermaidToSvg(params.code, params.theme);
      return {
        content: [{ type: 'text', text: result }],
        details: { format },
      };
    },
  };

  const listThemes: AgentTool<typeof ListThemesParams> = {
    name: 'list_mermaid_themes',
    label: 'List Mermaid Themes',
    description: 'List all available Mermaid themes for SVG rendering.',
    parameters: ListThemesParams,
    async execute() {
      const themes = await listMermaidThemes();
      return {
        content: [{ type: 'text', text: JSON.stringify(themes) }],
        details: { themes },
      };
    },
  };

  return [renderMermaid, listThemes];
}
