/**
 * Shared Mermaid rendering utility used by both:
 * - Claude in-process MCP server (mermaidServer.ts)
 * - Codex standalone MCP stdio server (mermaidStdioServer.ts)
 */

let beautifulMermaid: typeof import('beautiful-mermaid') | null = null;

async function loadBeautifulMermaid() {
  if (!beautifulMermaid) {
    beautifulMermaid = await import('beautiful-mermaid');
  }
  return beautifulMermaid;
}

export async function renderMermaidToSvg(
  code: string,
  theme?: string
): Promise<string> {
  const lib = await loadBeautifulMermaid();
  const themeName = theme ?? 'zinc-dark';
  const themeColors = lib.THEMES[themeName] ?? lib.THEMES['zinc-dark'];
  return lib.renderMermaid(code, { ...themeColors, transparent: false });
}

export async function renderMermaidToAscii(code: string): Promise<string> {
  const lib = await loadBeautifulMermaid();
  return lib.renderMermaidAscii(code);
}

export async function listMermaidThemes(): Promise<string[]> {
  const lib = await loadBeautifulMermaid();
  return Object.keys(lib.THEMES);
}
