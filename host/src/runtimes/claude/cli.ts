import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const PATH_SEPARATOR = isWindows ? ';' : ':';
const NODE_EXECUTABLE = isWindows ? 'node.exe' : 'node';

function getEnvValue(key: string): string | undefined {
  const hasKey = (name: string) => Object.prototype.hasOwnProperty.call(process.env, name);

  if (hasKey(key)) {
    return process.env[key];
  }

  if (!isWindows) {
    return undefined;
  }

  const upper = key.toUpperCase();
  if (hasKey(upper)) {
    return process.env[upper];
  }

  const lower = key.toLowerCase();
  if (hasKey(lower)) {
    return process.env[lower];
  }

  const matchKey = Object.keys(process.env).find(
    (name) => name.toLowerCase() === key.toLowerCase()
  );
  return matchKey ? process.env[matchKey] : undefined;
}

function expandEnvironmentVariables(value: string): string {
  if (!value.includes('%') && !value.includes('$') && !value.includes('!')) {
    return value;
  }

  let expanded = value;

  expanded = expanded.replace(
    /%([A-Za-z_][A-Za-z0-9_]*(?:\([A-Za-z0-9_]+\))?[A-Za-z0-9_]*)%/g,
    (match, name) => {
      const envValue = getEnvValue(name);
      return envValue !== undefined ? envValue : match;
    }
  );

  if (isWindows) {
    expanded = expanded.replace(/!([A-Za-z_][A-Za-z0-9_]*)!/g, (match, name) => {
      const envValue = getEnvValue(name);
      return envValue !== undefined ? envValue : match;
    });

    expanded = expanded.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (match, name) => {
      const envValue = getEnvValue(name);
      return envValue !== undefined ? envValue : match;
    });
  }

  expanded = expanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name1, name2) => {
    const key = name1 ?? name2;
    if (!key) return match;
    const envValue = getEnvValue(key);
    return envValue !== undefined ? envValue : match;
  });

  return expanded;
}

function expandHomePath(value: string): string {
  const expanded = expandEnvironmentVariables(value);
  if (expanded === '~') {
    return os.homedir();
  }
  if (expanded.startsWith('~/')) {
    return path.join(os.homedir(), expanded.slice(2));
  }
  if (expanded.startsWith('~\\')) {
    return path.join(os.homedir(), expanded.slice(2));
  }
  return expanded;
}

function stripSurroundingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isPathPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === '$PATH' || trimmed === '${PATH}') return true;
  return trimmed.toUpperCase() === '%PATH%';
}

export function parsePathEntries(pathValue?: string): string[] {
  if (!pathValue) {
    return [];
  }

  return pathValue
    .split(PATH_SEPARATOR)
    .map((segment) => stripSurroundingQuotes(segment.trim()))
    .filter((segment) => segment.length > 0 && !isPathPlaceholder(segment))
    .map((segment) => expandHomePath(segment));
}

function dedupePaths(entries: string[]): string[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = isWindows ? entry.toLowerCase() : entry;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isExistingFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      return stat.isFile();
    }
  } catch {
    return false;
  }
  return false;
}

function findFirstExistingPath(entries: string[], candidates: string[]): string | null {
  for (const dir of entries) {
    if (!dir) continue;
    for (const candidate of candidates) {
      const fullPath = path.join(dir, candidate);
      if (isExistingFile(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function getNpmGlobalPrefix(): string | null {
  if (process.env.npm_config_prefix) {
    return process.env.npm_config_prefix;
  }

  if (isWindows) {
    const appDataNpm = process.env.APPDATA
      ? path.join(process.env.APPDATA, 'npm')
      : null;
    if (appDataNpm && fs.existsSync(appDataNpm)) {
      return appDataNpm;
    }
  }

  return null;
}

function getNpmCliJsPaths(): string[] {
  const homeDir = os.homedir();
  const cliJsPaths: string[] = [];

  if (isWindows) {
    cliJsPaths.push(
      path.join(homeDir, 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
    );

    const npmPrefix = getNpmGlobalPrefix();
    if (npmPrefix) {
      cliJsPaths.push(
        path.join(npmPrefix, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
      );
    }

    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    cliJsPaths.push(
      path.join(programFiles, 'nodejs', 'node_global', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
      path.join(programFilesX86, 'nodejs', 'node_global', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
      path.join('D:', 'Program Files', 'nodejs', 'node_global', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
    );
  } else {
    cliJsPaths.push(
      path.join(homeDir, '.npm-global', 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
      '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
      '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js'
    );

    if (process.env.npm_config_prefix) {
      cliJsPaths.push(
        path.join(process.env.npm_config_prefix, 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
      );
    }
  }

  return cliJsPaths;
}

function resolveClaudeFromPathEntries(entries: string[]): string | null {
  if (!entries.length) return null;

  if (!isWindows) {
    return findFirstExistingPath(entries, ['claude']);
  }

  const exeCandidate = findFirstExistingPath(entries, ['claude.exe', 'claude']);
  if (exeCandidate) return exeCandidate;

  for (const entry of entries) {
    const candidate = path.join(entry, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (isExistingFile(candidate)) return candidate;
  }

  return null;
}

export function findClaudeCLIPath(pathValue?: string): string | null {
  const homeDir = os.homedir();

  const customEntries = dedupePaths(parsePathEntries(pathValue));
  if (customEntries.length > 0) {
    const customResolution = resolveClaudeFromPathEntries(customEntries);
    if (customResolution) return customResolution;
  }

  if (isWindows) {
    const exePaths: string[] = [
      path.join(homeDir, '.claude', 'local', 'claude.exe'),
      path.join(homeDir, 'AppData', 'Local', 'Claude', 'claude.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Claude', 'claude.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Claude', 'claude.exe'),
      path.join(homeDir, '.local', 'bin', 'claude.exe'),
    ];

    for (const p of exePaths) {
      if (isExistingFile(p)) return p;
    }

    for (const p of getNpmCliJsPaths()) {
      if (isExistingFile(p)) return p;
    }
  }

  const commonPaths: string[] = [
    path.join(homeDir, '.claude', 'local', 'claude'),
    path.join(homeDir, '.local', 'bin', 'claude'),
    path.join(homeDir, '.volta', 'bin', 'claude'),
    path.join(homeDir, '.asdf', 'shims', 'claude'),
    path.join(homeDir, '.asdf', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(homeDir, 'bin', 'claude'),
    path.join(homeDir, '.npm-global', 'bin', 'claude'),
  ];

  const npmPrefix = getNpmGlobalPrefix();
  if (npmPrefix) {
    commonPaths.push(path.join(npmPrefix, 'bin', 'claude'));
  }

  for (const p of commonPaths) {
    if (isExistingFile(p)) return p;
  }

  if (!isWindows) {
    for (const p of getNpmCliJsPaths()) {
      if (isExistingFile(p)) return p;
    }
  }

  const envEntries = dedupePaths(parsePathEntries(getEnvValue('PATH')));
  if (envEntries.length > 0) {
    return resolveClaudeFromPathEntries(envEntries);
  }

  return null;
}

export function parseEnvironmentVariables(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex > 0) {
      const key = normalized.substring(0, eqIndex).trim();
      let value = normalized.substring(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) {
        result[key] = value;
      }
    }
  }
  return result;
}

function findNodeDirectory(): string | null {
  const currentPath = process.env.PATH || '';
  const pathDirs = parsePathEntries(currentPath);

  for (const dir of pathDirs) {
    if (!dir) continue;
    try {
      const nodePath = path.join(dir, NODE_EXECUTABLE);
      if (fs.existsSync(nodePath)) {
        const stat = fs.statSync(nodePath);
        if (stat.isFile()) {
          return dir;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

function cliPathRequiresNode(cliPath: string): boolean {
  const jsExtensions = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'];
  const lower = cliPath.toLowerCase();
  if (jsExtensions.some((ext) => lower.endsWith(ext))) {
    return true;
  }
  return false;
}

export function getEnhancedPath(additionalPaths?: string, cliPath?: string): string {
  const currentPath = process.env.PATH || '';
  const segments: string[] = [];

  if (additionalPaths) {
    segments.push(...parsePathEntries(additionalPaths));
  }

  let cliDirHasNode = false;
  if (cliPath) {
    try {
      const cliDir = path.dirname(cliPath);
      const nodeInCliDir = path.join(cliDir, NODE_EXECUTABLE);
      if (fs.existsSync(nodeInCliDir)) {
        const stat = fs.statSync(nodeInCliDir);
        if (stat.isFile()) {
          segments.push(cliDir);
          cliDirHasNode = true;
        }
      }
    } catch {
      // ignore
    }
  }

  if (cliPath && cliPathRequiresNode(cliPath) && !cliDirHasNode) {
    const nodeDir = findNodeDirectory();
    if (nodeDir) {
      segments.push(nodeDir);
    }
  }

  if (currentPath) {
    segments.push(...parsePathEntries(currentPath));
  }

  const seen = new Set<string>();
  const unique = segments.filter((entry) => {
    const normalized = isWindows ? entry.toLowerCase() : entry;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  return unique.join(PATH_SEPARATOR);
}

export function resolveClaudeCliPath(cliPath?: string, extraPath?: string): string | null {
  const trimmed = (cliPath ?? '').trim();
  if (trimmed) {
    const expanded = expandHomePath(trimmed);
    if (isExistingFile(expanded)) {
      return expanded;
    }
  }

  if (process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT === 'true') {
    return null;
  }

  return findClaudeCLIPath(extraPath);
}
