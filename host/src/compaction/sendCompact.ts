import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runClaudeText, type ClaudeRuntimeConfig } from '../runtimes/claude/agent.js';
import type { CodexRuntimeConfig } from '../runtimes/codex/run.js';
import { getCodexAppServer } from '../runtimes/codex/appServer.js';
import { parseCodexTokenUsage } from '../runtimes/codex/tokenUsage.js';
import type { JobEvent } from '../types.js';

type EmitEvent = (event: JobEvent) => void;

type CodexApprovalPolicy = 'untrusted' | 'on-request' | 'on-failure' | 'never';

function normalizeApprovalPolicy(value: unknown): CodexApprovalPolicy {
  if (value === 'untrusted' || value === 'on-request' || value === 'on-failure' || value === 'never') {
    return value;
  }
  return 'on-request';
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

function getCodexSessionCwd(threadId?: string): string {
  if (!threadId || !threadId.trim()) {
    return ensureAgeafWorkspaceCwd();
  }
  const sessionDir = path.join(os.homedir(), '.ageaf', 'codex', 'sessions', threadId.trim());
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch {
    // ignore directory creation failures
  }
  return sessionDir;
}

export async function sendCompactCommand(
  provider: 'claude' | 'codex',
  payload: any,
  emitEvent: EmitEvent
): Promise<void> {
  if (provider === 'claude') {
    await sendClaudeCompact(payload.runtime?.claude, emitEvent);
  } else {
    await sendCodexCompact(payload.runtime?.codex, emitEvent);
  }
}

async function sendClaudeCompact(
  runtime: ClaudeRuntimeConfig | undefined,
  emitEvent: EmitEvent
): Promise<void> {
  // Send "/compact" as a regular prompt
  await runClaudeText({
    prompt: '/compact',
    emitEvent,
    runtime,
    safety: { enabled: false },
    enableTools: false,
  });
}

async function sendCodexCompact(
  runtime: CodexRuntimeConfig | undefined,
  emitEvent: EmitEvent
): Promise<void> {
  const threadId = typeof runtime?.threadId === 'string' ? runtime.threadId.trim() : '';
  if (!threadId) {
    throw new Error('No Codex thread to compact yet. Send a message first.');
  }

  const cwd = getCodexSessionCwd(threadId);
  const appServer = await getCodexAppServer({
    cliPath: runtime?.cliPath,
    envVars: runtime?.envVars,
    cwd,
  });

  const approvalPolicy = normalizeApprovalPolicy(runtime?.approvalPolicy);
  const model =
    typeof runtime?.model === 'string' && runtime.model.trim() ? runtime.model.trim() : null;
  const effort =
    typeof runtime?.reasoningEffort === 'string' && runtime.reasoningEffort.trim()
      ? runtime.reasoningEffort.trim()
      : null;

  let done = false;
  let failureMessage: string | null = null;
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
      const hasRequestId = typeof requestId === 'number' || typeof requestId === 'string';

      if (msgThreadId !== threadId) return;

      if (hasRequestId && method.includes('requestApproval')) {
        if (approvalPolicy === 'never') {
          void appServer.respond(requestId as any, 'accept');
        }
        return;
      }

      if (method === 'thread/tokenUsage/updated') {
        const usage = parseCodexTokenUsage(params);
        if (usage) {
          emitEvent({
            event: 'usage',
            data: { model: null, usedTokens: usage.usedTokens, contextWindow: usage.contextWindow },
          });
        }
        return;
      }

      if (method === 'turn/completed') {
        if (!done) {
          done = true;
        }
        unsubscribe();
        resolve();
        return;
      }

      if (method === 'error' || method === 'turn/error') {
        if (!done) {
          done = true;
          failureMessage = String(params?.error?.message ?? params?.error ?? 'Turn failed');
        }
        unsubscribe();
        resolve();
        return;
      }
    });
  });

  // Try to resume the thread first in case it's not in Codex's active memory
  try {
    await appServer.request('thread/resume', {
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
  } catch (resumeError) {
    // If resume fails with "thread not found", the thread is truly gone
    const errorMsg = String((resumeError as any)?.message ?? resumeError ?? '');
    if (errorMsg.toLowerCase().includes('not found') || errorMsg.toLowerCase().includes('unknown')) {
      throw new Error(
        `Thread ${threadId} not found. The Codex session may have expired. Start a new conversation.`
      );
    }
    // Other errors - continue and try turn/start anyway
  }

  const turnResponse = await appServer.request('turn/start', {
    threadId,
    input: [{ type: 'text', text: '/compact' }],
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
    const errorMessage = String(
      (turnResponse as any).error?.message ?? (turnResponse as any).error ?? 'Turn failed'
    );
    unsubscribe();
    resolveDone();
    throw new Error(errorMessage);
  }

  await donePromise;
  if (failureMessage) {
    throw new Error(failureMessage);
  }
}

export async function getContextUsage(provider: string, payload: any) {
  if (provider === 'claude') {
    const { getClaudeContextUsage } = await import('../runtimes/claude/context.js');
    return await getClaudeContextUsage(payload.runtime?.claude);
  } else {
    const { getCodexContextUsage } = await import('../runtimes/codex/context.js');
    return await getCodexContextUsage({
      cliPath: payload.runtime?.codex?.cliPath,
      envVars: payload.runtime?.codex?.envVars,
      threadId: payload.runtime?.codex?.threadId,
    });
  }
}
