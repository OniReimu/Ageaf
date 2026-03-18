/**
 * Shared tool display info extraction.
 * Used by all runtimes (Claude, Codex, PI) to produce consistent
 * display-friendly tool metadata for frontend rendering.
 */

export const MAX_TOOL_DISPLAY_LEN = 120;

function truncate(s: string): string {
  return s.length > MAX_TOOL_DISPLAY_LEN ? s.slice(0, MAX_TOOL_DISPLAY_LEN) + '...' : s;
}

/** Normalize raw tool input (string | object | undefined) into a Record. */
export function normalizeToolInput(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { _raw: raw };
    } catch {
      return { _raw: raw };
    }
  }
  return null;
}

/** Strip undefined values from result object. */
function clean(obj: { input?: string; description?: string }): { input?: string; description?: string } {
  const result: { input?: string; description?: string } = {};
  if (obj.input !== undefined) result.input = obj.input;
  if (obj.description !== undefined) result.description = obj.description;
  return result;
}

/** Extract display-friendly info from normalized tool input. */
export function extractToolDisplayInfo(
  toolName: string,
  input: Record<string, unknown>,
): { input?: string; description?: string } {
  const str = (key: string): string | undefined => {
    const v = input[key];
    return typeof v === 'string' ? truncate(v) : undefined;
  };

  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return clean({ input: str('file_path') ?? str('path') ?? str('filePath') });

    case 'Bash':
      return clean({ input: str('command'), description: str('description') });

    case 'Grep':
      return clean({ input: str('pattern'), description: str('glob') ?? str('path') });

    case 'Glob':
      return clean({ input: str('pattern'), description: str('path') });

    case 'WebSearch':
      return clean({ input: str('query') });

    case 'WebFetch':
      return clean({ input: str('url') });

    case 'Agent':
      return clean({ input: str('description'), description: str('subagent_type') });

    case 'Skill':
      return clean({ input: str('skill'), description: str('args') });

    case 'ToolSearch':
      return clean({ input: str('query') });

    case 'LSP':
      return clean({ input: str('method') ?? str('command'), description: str('path') });

    default: {
      // Task* tools
      if (toolName.startsWith('Task')) {
        return clean({ input: str('description') ?? str('task_id'), description: str('status') });
      }

      // MCP tools (mcp__*)
      if (toolName.startsWith('mcp__') || toolName.startsWith('mcp_')) {
        for (const v of Object.values(input)) {
          if (typeof v === 'string' && v) return { input: truncate(v) };
        }
        return {};
      }

      // Cron* tools
      if (toolName.startsWith('Cron')) {
        return clean({ input: str('description') ?? str('cron_id') });
      }

      // Fallback: return first string value
      for (const v of Object.values(input)) {
        if (typeof v === 'string' && v) return { input: truncate(v) };
      }
      return {};
    }
  }
}
