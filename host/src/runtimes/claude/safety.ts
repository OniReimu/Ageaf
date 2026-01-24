export type CommandBlocklistConfig = {
  enabled: boolean;
  patternsText?: string;
};

export type CompiledBlockedCommandPattern =
  | { raw: string; regex: RegExp }
  | { raw: string; substring: string };

export function parseBlockedCommandPatterns(patternsText?: string): string[] {
  if (!patternsText) return [];
  return patternsText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('#'));
}

export function compileBlockedCommandPatterns(
  patterns: string[]
): CompiledBlockedCommandPattern[] {
  const compiled: CompiledBlockedCommandPattern[] = [];
  for (const raw of patterns) {
    try {
      compiled.push({ raw, regex: new RegExp(raw) });
    } catch {
      compiled.push({ raw, substring: raw });
    }
  }
  return compiled;
}

export function matchBlockedCommand(
  command: string,
  compiled: CompiledBlockedCommandPattern[]
): string | null {
  const normalized = command.trim();
  if (!normalized) return null;
  for (const pattern of compiled) {
    if ('regex' in pattern) {
      if (pattern.regex.test(normalized)) return pattern.raw;
    } else {
      if (normalized.includes(pattern.substring)) return pattern.raw;
    }
  }
  return null;
}

export function extractCommandFromToolInput(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  // Claude Code's command tool is typically named "Bash".
  if (!/bash/i.test(toolName)) return null;
  const candidate =
    (input.command as unknown) ??
    (input.cmd as unknown) ??
    (input.script as unknown) ??
    (input.value as unknown);

  if (typeof candidate === 'string') return candidate;
  return null;
}


