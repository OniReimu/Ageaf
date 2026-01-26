import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { JobEvent } from '../../types.js';
import { getCodexAppServer } from './appServer.js';
import { parseCodexTokenUsage } from './tokenUsage.js';

type EmitEvent = (event: JobEvent) => void;

export type CodexApprovalPolicy = 'untrusted' | 'on-request' | 'on-failure' | 'never';

export type CodexRuntimeConfig = {
  cliPath?: string;
  envVars?: string;
  approvalPolicy?: CodexApprovalPolicy;
  model?: string;
  reasoningEffort?: string;
  threadId?: string;
};

type CodexJobPayload = {
  action?: string;
  context?: unknown;
  runtime?: { codex?: CodexRuntimeConfig };
  userSettings?: {
    customSystemPrompt?: string;
    displayName?: string;
  };
};

function getUserMessage(context: unknown): string | undefined {
  if (!context || typeof context !== 'object') return undefined;
  const value = (context as { message?: unknown }).message;
  return typeof value === 'string' ? value : undefined;
}

function ensureAgeafWorkspaceCwd(): string {
  const workspace = path.join(os.homedir(), '.ageaf');
  try {
    fs.mkdirSync(workspace, { recursive: true });
  } catch {
    // ignore workspace creation failures
  }
  return workspace;
}

function extractThreadId(response: any): string | null {
  const candidate =
    response?.result?.threadId ??
    response?.result?.thread_id ??
    response?.result?.thread?.id ??
    response?.threadId ??
    response?.thread_id ??
    response?.thread?.id;
  return typeof candidate === 'string' && candidate ? candidate : null;
}

function normalizeApprovalPolicy(value: unknown): CodexApprovalPolicy {
  if (value === 'untrusted' || value === 'on-request' || value === 'on-failure' || value === 'never') {
    return value;
  }
  return 'on-request';
}

function buildPrompt(payload: CodexJobPayload) {
  const action = payload.action ?? 'chat';
  const message = getUserMessage(payload.context) ?? '';
  const custom = payload.userSettings?.customSystemPrompt?.trim();

  const baseParts = [
    'You are Ageaf, a concise Overleaf assistant.',
    'Respond in Markdown, keep it concise.',
    `Action: ${action}`,
    payload.context ? `Context:\n${JSON.stringify(payload.context, null, 2)}` : '',
  ].filter(Boolean);

  if (custom) {
    baseParts.push(`\nAdditional instructions:\n${custom}`);
  }

  if (message) {
    baseParts.push(`\nUser message:\n${message}`);
  }

  return baseParts.join('\n\n');
}

export async function runCodexJob(payload: CodexJobPayload, emitEvent: EmitEvent) {
  if (process.env.AGEAF_CODEX_MOCK === 'true') {
    emitEvent({ event: 'delta', data: { text: 'Mock response.' } });
    emitEvent({
      event: 'usage',
      data: { model: 'mock', usedTokens: 1200, contextWindow: 200000 },
    });
    emitEvent({ event: 'done', data: { status: 'ok', threadId: 'mock-thread' } });
    return;
  }

  const runtime = payload.runtime?.codex ?? {};
  const cwd = ensureAgeafWorkspaceCwd();
  const approvalPolicy = normalizeApprovalPolicy(runtime.approvalPolicy);
  const model =
    typeof runtime.model === 'string' && runtime.model.trim() ? runtime.model.trim() : null;
  const effort =
    typeof runtime.reasoningEffort === 'string' && runtime.reasoningEffort.trim()
      ? runtime.reasoningEffort.trim()
      : null;
  const appServer = await getCodexAppServer({
    cliPath: runtime.cliPath,
    envVars: runtime.envVars,
    cwd,
  });

  let threadId = runtime.threadId?.trim() || '';
  if (!threadId) {
    const threadResponse = await appServer.request('thread/start', {
      model,
      modelProvider: null,
      cwd,
      approvalPolicy,
      sandbox: 'read-only',
      config: null,
      baseInstructions: null,
      developerInstructions: null,
      experimentalRawEvents: false,
    });
    const extracted = extractThreadId(threadResponse);
    if (!extracted) {
      emitEvent({
        event: 'done',
        data: { status: 'error', message: 'Failed to start Codex thread' },
      });
      return;
    }
    threadId = extracted;
  } else {
    const resumeResponse = await appServer.request('thread/resume', {
      threadId,
      history: null,
      path: null,
      model,
      modelProvider: null,
      cwd,
      approvalPolicy,
      sandbox: 'read-only',
      config: null,
      baseInstructions: null,
      developerInstructions: null,
    });
    const extracted = extractThreadId(resumeResponse);
    if (!extracted) {
      emitEvent({
        event: 'done',
        data: { status: 'error', message: 'Failed to resume Codex thread', threadId },
      });
      return;
    }
    threadId = extracted;
  }

  const prompt = buildPrompt(payload);
  let done = false;
  // Filled synchronously by the Promise executor below.
  // (Promise executors run immediately.)
  let resolveDone!: () => void;
  let unsubscribe = () => {};

  const donePromise = new Promise<void>((resolve) => {
    resolveDone = () => resolve();
    unsubscribe = appServer.subscribe((message) => {
      const method = typeof message.method === 'string' ? message.method : '';
      const params = message.params as any;
      const msgThreadId = String(params?.threadId ?? params?.thread_id ?? '');
      const requestId = (message as { id?: unknown }).id;
      const hasRequestId =
        typeof requestId === 'number' || typeof requestId === 'string';

      if (msgThreadId !== threadId) return;

      if (hasRequestId && method.includes('requestApproval')) {
        if (approvalPolicy === 'never') {
          void appServer.respond(requestId as any, 'accept');
          return;
        }
        emitEvent({
          event: 'tool_call',
          data: {
            kind: 'approval',
            requestId,
            method,
            params: params ?? {},
          },
        });
        return;
      }

      if (hasRequestId && method === 'item/tool/requestUserInput') {
        emitEvent({
          event: 'tool_call',
          data: {
            kind: 'user_input',
            requestId,
            method,
            params: params ?? {},
          },
        });
        return;
      }

      if (method === 'item/agentMessage/delta') {
        const delta = String(params?.delta ?? '');
        if (delta) {
          emitEvent({ event: 'delta', data: { text: delta } });
        }
        return;
      }

      if (method === 'thread/tokenUsage/updated') {
        const usage = parseCodexTokenUsage(params);
        if (usage) {
          emitEvent({
            event: 'usage',
            data: {
              model: null,
              usedTokens: usage.usedTokens,
              contextWindow: usage.contextWindow,
            },
          });
        }
        return;
      }

      if (method === 'turn/completed') {
        if (!done) {
          done = true;
          emitEvent({ event: 'done', data: { status: 'ok', threadId } });
        }
        unsubscribe();
        resolve();
        return;
      }

      if (method === 'error' || method === 'turn/error') {
        if (!done) {
          done = true;
          const errorMessage = String(params?.error?.message ?? params?.error ?? 'Turn failed');
          emitEvent({
            event: 'done',
            data: { status: 'error', message: errorMessage, threadId },
          });
        }
        unsubscribe();
        resolve();
        return;
      }
    });
  });

  const turnResponse = await appServer.request('turn/start', {
    threadId,
    input: [{ type: 'text', text: prompt }],
    cwd,
    approvalPolicy,
    sandboxPolicy: { type: 'readOnly' },
    model,
    effort,
    summary: null,
    outputSchema: null,
    collaborationMode: null,
  });

  if (!done && turnResponse && Object.prototype.hasOwnProperty.call(turnResponse, 'error')) {
    done = true;
    const errorMessage = String((turnResponse as any).error?.message ?? (turnResponse as any).error ?? 'Turn failed');
    emitEvent({
      event: 'done',
      data: { status: 'error', message: errorMessage, threadId },
    });
    unsubscribe();
    resolveDone();
  }

  await donePromise;
}
