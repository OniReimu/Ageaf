const RESERVED_SLASH_COMMANDS = new Set<string>(['compact']);

export function isReservedSlashCommand(value: string): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return RESERVED_SLASH_COMMANDS.has(normalized);
}

