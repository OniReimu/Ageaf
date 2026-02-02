import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { getEnhancedPath, parseEnvironmentVariables } from '../claude/cli.js';

type JsonRpcId = number | string;

type JsonRpcMessage = {
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

type PendingRequest = {
  resolve: (value: JsonRpcMessage) => void;
  reject: (error: Error) => void;
};

export type CodexAppServerConfig = {
  cliPath?: string;
  envVars?: string;
  cwd: string;
};

export class CodexAppServer {
  private child: ReturnType<typeof spawn> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Set<(message: JsonRpcMessage) => void>();
  private started = false;

  constructor(private readonly config: CodexAppServerConfig) {}

  subscribe(listener: (message: JsonRpcMessage) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start() {
    if (this.started) return;
    this.started = true;

    const customEnv = parseEnvironmentVariables(this.config.envVars ?? '');
    const rawCliPath = this.config.cliPath?.trim();
    const cliPath =
      rawCliPath === '~'
        ? os.homedir()
        : rawCliPath?.startsWith('~/')
          ? path.join(os.homedir(), rawCliPath.slice(2))
          : rawCliPath;
    const env = {
      ...process.env,
      ...customEnv,
      PATH: getEnhancedPath(customEnv.PATH, cliPath),
    };

    const command = cliPath && cliPath.length > 0 ? cliPath : 'codex';
    const child = spawn(command, ['app-server'], {
      cwd: this.config.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;

    const handleChildError = (error: Error) => {
      this.child = null;
      this.started = false;
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    };

    child.on('error', handleChildError);

    child.on('exit', () => {
      this.child = null;
      this.started = false;
      for (const pending of this.pending.values()) {
        pending.reject(new Error('Codex app-server exited'));
      }
      this.pending.clear();
    });

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve());
      child.once('error', (error) => reject(error));
    });

    const stdout = child.stdout;
    if (stdout) {
      const rl = createInterface({ input: stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let message: JsonRpcMessage;
        try {
          message = JSON.parse(trimmed) as JsonRpcMessage;
        } catch {
          return;
        }

        const idValue = message.id;
        const id =
          typeof idValue === 'number' && Number.isFinite(idValue)
            ? idValue
            : null;
        const hasResultOrError =
          Object.prototype.hasOwnProperty.call(message, 'result') ||
          Object.prototype.hasOwnProperty.call(message, 'error');
        const hasMethod = typeof message.method === 'string' && message.method.length > 0;

        if (id != null && hasResultOrError) {
          const pending = this.pending.get(id);
          if (pending) {
            this.pending.delete(id);
            pending.resolve(message);
          }
          return;
        }

        if (hasMethod) {
          for (const listener of this.listeners) {
            listener(message);
          }
          return;
        }
      });
    }
  }

  async request(
    method: string,
    params: unknown,
    options?: { timeoutMs?: number }
  ): Promise<JsonRpcMessage> {
    await this.start();
    const child = this.child;
    if (!child?.stdin) {
      throw new Error('Codex app-server is not running');
    }

    const id = this.nextId++;
    const payload: JsonRpcMessage = { id, method, params };

    const promise = new Promise<JsonRpcMessage>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    const timeoutMs = Number(options?.timeoutMs ?? 60000);
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;
      timeoutId = setTimeout(() => {
        // Remove from pending so a late response doesn't leak memory.
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out after ${timeoutMs}ms (${method})`));
      }, timeoutMs);
    });

    child.stdin.write(`${JSON.stringify(payload)}\n`);
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async notify(method: string, params?: unknown) {
    await this.start();
    const child = this.child;
    if (!child?.stdin) {
      throw new Error('Codex app-server is not running');
    }
    const payload: JsonRpcMessage =
      params === undefined ? { method } : { method, params };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async respond(id: JsonRpcId, result: unknown) {
    await this.start();
    const child = this.child;
    if (!child?.stdin) {
      throw new Error('Codex app-server is not running');
    }
    const payload: JsonRpcMessage = { id, result };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async stop() {
    const child = this.child;
    this.child = null;
    this.started = false;
    if (child) {
      child.kill();
    }
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Codex app-server stopped'));
    }
    this.pending.clear();
  }
}

let cachedServer: CodexAppServer | null = null;
let cachedKey: string | null = null;

function getCacheKey(config: CodexAppServerConfig): string {
  return [
    config.cliPath ?? '',
    config.envVars ?? '',
    config.cwd,
  ].join('\n');
}

export async function getCodexAppServer(config: CodexAppServerConfig) {
  const key = getCacheKey(config);
  if (cachedServer && cachedKey === key) {
    await cachedServer.start();
    return cachedServer;
  }

  if (cachedServer) {
    await cachedServer.stop();
  }

  const server = new CodexAppServer(config);
  cachedServer = server;
  cachedKey = key;
  await server.start();
  await server.request('initialize', {
    clientInfo: { name: 'ageaf', title: 'Ageaf', version: '0.0.0' },
  });
  await server.notify('initialized');
  return server;
}

export async function resetCodexAppServerForTests() {
  if (!cachedServer) return;
  await cachedServer.stop();
  cachedServer = null;
  cachedKey = null;
}

