/**
 * Project-level search tools for the Pi runtime.
 *
 * These tools let the LLM search and read Overleaf project files on demand,
 * rather than relying on a fixed surrounding-context window.
 *
 * Tools:
 *   - list_project_files: list all files in the project
 *   - grep_project: regex search across project files
 *   - read_lines: read specific line ranges from a file
 */

import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

export type ProjectFile = {
  path: string;
  content: string;
};

const ListProjectFilesParams = Type.Object({});

const GrepProjectParams = Type.Object({
  pattern: Type.String({
    description:
      'Regex pattern to search for (e.g. "\\\\mathcal\\\\{A\\\\}", "\\\\newcommand", "anonymity")',
  }),
  file: Type.Optional(
    Type.String({
      description:
        'Optional: limit search to a specific file path (e.g. "main.tex")',
    })
  ),
});

const ReadLinesParams = Type.Object({
  file: Type.String({
    description: 'File path (e.g. "main.tex", "sections/intro.tex")',
  }),
  start_line: Type.Optional(
    Type.Number({
      description:
        'Start line number (1-based, inclusive). Omit to start from beginning.',
    })
  ),
  end_line: Type.Optional(
    Type.Number({
      description:
        'End line number (1-based, inclusive). Omit to read to end.',
    })
  ),
});

/**
 * Create agent tools that can search/read from the given project files.
 * Returns an array of AgentTool instances scoped to the provided files.
 */
export function createProjectContextTools(
  files: ProjectFile[]
): AgentTool<any>[] {
  const fileMap = new Map<string, string>();
  for (const f of files) {
    fileMap.set(f.path, f.content);
  }

  const text = (s: string) => ({
    content: [{ type: 'text' as const, text: s }],
    details: {},
  });

  const listProjectFiles: AgentTool<typeof ListProjectFilesParams> = {
    name: 'list_project_files',
    label: 'List Project Files',
    description:
      'List all files available in the Overleaf project. Returns file paths and line counts.',
    parameters: ListProjectFilesParams,
    async execute() {
      const entries = files.map((f) => {
        const lineCount = f.content.split('\n').length;
        return `${f.path} (${lineCount} lines)`;
      });
      return text(entries.join('\n') || '(no project files available)');
    },
  };

  const grepProject: AgentTool<typeof GrepProjectParams> = {
    name: 'grep_project',
    label: 'Grep Project',
    description:
      'Search for a regex pattern across project files. Returns matching lines with file path and line number. Use this to locate definitions, macros (\\newcommand), notation tables, or any symbol/term.',
    parameters: GrepProjectParams,
    async execute(_toolCallId, params) {
      const { pattern, file } = params;
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch {
        return text(`Error: invalid regex pattern "${pattern}"`);
      }

      const MAX_MATCHES = 50;
      const results: string[] = [];
      let matchCount = 0;

      const searchEntries = file
        ? ([[file, fileMap.get(file)] as const])
        : Array.from(fileMap.entries());

      for (const [filePath, content] of searchEntries) {
        if (!content) {
          if (file) return text(`Error: file "${file}" not found in project`);
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            results.push(`${filePath}:${i + 1}: ${lines[i]}`);
            matchCount++;
            if (matchCount >= MAX_MATCHES) {
              results.push(`... (truncated at ${MAX_MATCHES} matches)`);
              return text(results.join('\n'));
            }
          }
        }
      }

      return text(
        results.length > 0
          ? results.join('\n')
          : `No matches found for "${pattern}"${file ? ` in ${file}` : ''}`
      );
    },
  };

  const resolveFilePath = (filePath: string): string | null => {
    if (fileMap.has(filePath)) return filePath;
    // Case-insensitive / partial match
    return (
      Array.from(fileMap.keys()).find(
        (k) =>
          k.toLowerCase() === filePath.toLowerCase() ||
          k.endsWith(`/${filePath}`) ||
          k.endsWith(`/${filePath}.tex`)
      ) ?? null
    );
  };

  const readLines: AgentTool<typeof ReadLinesParams> = {
    name: 'read_lines',
    label: 'Read Lines',
    description:
      'Read lines from a specific project file. If start_line/end_line are omitted, returns the entire file. Line numbers are 1-based.',
    parameters: ReadLinesParams,
    async execute(_toolCallId, params) {
      const { file: filePath, start_line, end_line } = params;
      const resolved = resolveFilePath(filePath);
      if (!resolved) {
        return text(
          `Error: file "${filePath}" not found. Use list_project_files to see available files.`
        );
      }

      const content = fileMap.get(resolved)!;
      const lines = content.split('\n');
      const start = Math.max(1, start_line ?? 1);
      const end = Math.min(lines.length, end_line ?? lines.length);

      if (start > lines.length) {
        return text(
          `Error: start_line ${start} exceeds file length (${lines.length} lines)`
        );
      }

      const MAX_LINES = 200;
      const slice = lines.slice(start - 1, end);
      const truncated = slice.length > MAX_LINES;
      const output = (truncated ? slice.slice(0, MAX_LINES) : slice)
        .map((line, i) => `${start + i}: ${line}`)
        .join('\n');

      return text(
        truncated
          ? `${output}\n... (showing ${MAX_LINES} of ${slice.length} lines, use narrower range)`
          : output
      );
    },
  };

  return [listProjectFiles, grepProject, readLines];
}

/** Tool catalog entries for project context tools (used in system prompt). */
export const PROJECT_TOOL_CATALOG = [
  {
    name: 'list_project_files',
    label: 'List Project Files',
    description: 'List all files in the Overleaf project',
    source: 'project-context',
  },
  {
    name: 'grep_project',
    label: 'Grep Project',
    description:
      'Search for a pattern across project files (find definitions, macros, notation)',
    source: 'project-context',
  },
  {
    name: 'read_lines',
    label: 'Read Lines',
    description: 'Read specific lines from a project file',
    source: 'project-context',
  },
];
