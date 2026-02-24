import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runClaudeText, type ClaudeRuntimeConfig } from '../runtimes/claude/agent.js';
import { getClaudeContextUsage } from '../runtimes/claude/context.js';
import type { CodexRuntimeConfig } from '../runtimes/codex/run.js';
import { getCodexAppServer } from '../runtimes/codex/appServer.js';
import { getCodexContextUsage } from '../runtimes/codex/context.js';
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

// Track active compaction operations to prevent concurrent compacts
const activeCompacts = new Set<string>();

// Compact operation timeout (60 seconds)
const COMPACT_TIMEOUT_MS = 60000;

export async function sendCompactCommand(
  provider: 'claude' | 'codex',
  payload: any,
  emitEvent: EmitEvent
): Promise<void> {
  if (provider === 'claude') {
    const debugCliEvents = Boolean(payload?.userSettings?.debugCliEvents);
    await sendClaudeCompact(payload.runtime?.claude, emitEvent, debugCliEvents);
  } else {
    const debugCliEvents = Boolean(payload?.userSettings?.debugCliEvents);
    await sendCodexCompact(payload.runtime?.codex, emitEvent, debugCliEvents);
  }
}

async function sendClaudeCompact(
  runtime: ClaudeRuntimeConfig | undefined,
  emitEvent: EmitEvent,
  debugCliEvents: boolean
): Promise<void> {
  const conversationId = runtime?.conversationId ?? 'unknown';
  const toolId = `compaction-${Date.now()}`;

  // Prevent concurrent compaction
  if (activeCompacts.has(conversationId)) {
    throw new Error('Compaction already in progress for this conversation. Please wait.');
  }

  activeCompacts.add(conversationId);
  const compactStartTime = Date.now();
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    console.log(`[Claude Compact] Starting for conversation ${conversationId}`);

    emitEvent({
      event: 'plan',
      data: {
        phase: 'tool_start',
        toolId,
        toolName: 'Compacting',
        message: 'Compacting context... (reducing context window usage)',
      },
    });

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        console.error(`[Claude Compact] Timeout after ${COMPACT_TIMEOUT_MS}ms for ${conversationId}`);
        reject(
          new Error(
            `Compaction timed out after ${COMPACT_TIMEOUT_MS / 1000}s. The Claude CLI may be unresponsive.`
          )
        );
      }, COMPACT_TIMEOUT_MS);
    });

    // Wrap emitEvent to suppress 'done' events from the compaction sub-query.
    // runClaudeText always emits a 'done' event when finished, but during
    // auto-compaction the job must continue to process the user's actual request.
    // Forwarding 'done' here would prematurely terminate the job's SSE stream.
    const compactEmit: EmitEvent = (event) => {
      if (event.event === 'done') return;
      emitEvent(event);
    };

    // Send "/compact" as a regular prompt with timeout
    const compactPromise = runClaudeText({
      prompt: '/compact',
      emitEvent: compactEmit,
      runtime,
      safety: { enabled: false },
      debugCliEvents,
    });

    try {
      await Promise.race([compactPromise, timeoutPromise]);

      console.log(`[Claude Compact] Completed successfully for ${conversationId} in ${Date.now() - compactStartTime}ms`);

      emitEvent({
        event: 'plan',
        data: {
          phase: 'compaction_complete',
          toolId,
          toolName: 'Compacting',
          message: 'Context compaction complete',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Compaction failed';
      emitEvent({
        event: 'plan',
        data: {
          phase: 'tool_error',
          toolId,
          toolName: 'Compacting',
          message: `Context compaction failed: ${message}`,
        },
      });
      throw error;
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    // Always remove from active compacts set
    activeCompacts.delete(conversationId);
  }
}

async function sendCodexCompact(
  runtime: CodexRuntimeConfig | undefined,
  emitEvent: EmitEvent,
  debugCliEvents: boolean
): Promise<void> {
  const threadId = typeof runtime?.threadId === 'string' ? runtime.threadId.trim() : '';
  if (!threadId) {
    throw new Error('No Codex thread to compact yet. Send a message first.');
  }

  // Prevent concurrent compaction on the same thread
  if (activeCompacts.has(threadId)) {
    throw new Error('Compaction already in progress for this conversation. Please wait.');
  }

  // IMPORTANT: Codex CLI can show interactive prompts during /compact
  // Example: "Switch to gpt-5.1-codex-mini? 1. Switch 2. Keep current model"
  // These prompts require user selection and will hang forever in programmatic mode
  // Solution: Force approvalPolicy='never' + auto-accept all requests in subscription

  activeCompacts.add(threadId);
  const compactStartTime = Date.now();

  try {
    if (debugCliEvents) {
      emitEvent({ event: 'trace', data: { message: 'Compacting history (Codex)…' } });
    }
    const cwd = getCodexSessionCwd(threadId);
    const appServer = await getCodexAppServer({
      cliPath: runtime?.cliPath,
      envVars: runtime?.envVars,
      cwd,
    });

    // Force 'never' approval policy for compaction - it's a background operation
    // We also auto-accept all approval requests in the subscription handler
    const approvalPolicy: CodexApprovalPolicy = 'never';
    const model =
      typeof runtime?.model === 'string' && runtime.model.trim() ? runtime.model.trim() : null;
    const effort =
      typeof runtime?.reasoningEffort === 'string' && runtime.reasoningEffort.trim()
        ? runtime.reasoningEffort.trim()
        : null;

    let done = false;
    let failureMessage: string | null = null;
    let cliAcknowledged = false;
    let lastMessageTime = Date.now();
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

        if (debugCliEvents) {
          if (method === 'thread/tokenUsage/updated') {
            emitEvent({ event: 'trace', data: { message: 'Codex: usage updated (during compaction)' } });
          }
          if (method === 'turn/completed') {
            emitEvent({ event: 'trace', data: { message: 'Compaction completed (Codex)' } });
          }
          if (method === 'error' || method === 'turn/error') {
            emitEvent({ event: 'trace', data: { message: 'Compaction error (Codex)' } });
          }
        }

        // Track that CLI is responding
        lastMessageTime = Date.now();
        if (!cliAcknowledged) {
          cliAcknowledged = true;
        }

        // CRITICAL: During compaction, ALWAYS auto-accept ALL approval requests
        // This includes model switch prompts, rate limit warnings, interactive selections, etc.
        // Compaction is a background operation that cannot wait for user input.
        // The CLI will hang forever if we don't respond to interactive prompts.
        if (hasRequestId && method.includes('requestApproval')) {
          console.log(`[Codex Compact] Auto-accepting approval request: ${method}`);
          void appServer.respond(requestId as any, 'accept');
          if (debugCliEvents) {
            emitEvent({ event: 'trace', data: { message: 'Codex: auto-accepted approval (during compaction)' } });
          }
          return;
        }

        // Also catch other potential interactive prompts (select, confirm, etc.)
        if (hasRequestId && (method.includes('prompt') || method.includes('select') || method.includes('confirm'))) {
          console.log(`[Codex Compact] Auto-accepting interactive prompt: ${method}`);
          void appServer.respond(requestId as any, 'accept');
          if (debugCliEvents) {
            emitEvent({ event: 'trace', data: { message: 'Codex: auto-accepted prompt (during compaction)' } });
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
            console.log(`[Codex Compact] Completed successfully for thread ${threadId} in ${Date.now() - compactStartTime}ms`);
          }
          unsubscribe();
          resolve();
          return;
        }

        if (method === 'error' || method === 'turn/error') {
          if (!done) {
            done = true;
            failureMessage = String(params?.error?.message ?? params?.error ?? 'Turn failed');
            console.error(`[Codex Compact] Failed for thread ${threadId}: ${failureMessage}`);
          }
          unsubscribe();
          resolve();
          return;
        }
      });
    });

    // Try to resume the thread first in case it's not in Codex's active memory
    try {
      await appServer.request(
        'thread/resume',
        {
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
        },
        { timeoutMs: 30000 }
      );
    } catch (resumeError) {
      // If resume fails with "thread not found", the thread is truly gone
      const errorMsg = String((resumeError as any)?.message ?? resumeError ?? '');
      if (errorMsg.toLowerCase().includes('not found') || errorMsg.toLowerCase().includes('unknown')) {
        throw new Error(
          `Thread ${threadId} not found. The Codex session may have expired. Start a new conversation.`
        );
      }
      // Other errors - continue and try turn/start anyway
      console.warn(`[Codex Compact] Thread resume warning for ${threadId}:`, errorMsg);
    }

    emitEvent({
      event: 'plan',
      data: { message: 'Sending compact command to Codex CLI...' },
    });

    const turnResponse = await appServer.request(
      'turn/start',
      {
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
      },
      { timeoutMs: 30000 }
    );

    if (!done && turnResponse && Object.prototype.hasOwnProperty.call(turnResponse, 'error')) {
      done = true;
      const errorMessage = String(
        (turnResponse as any).error?.message ?? (turnResponse as any).error ?? 'Turn failed'
      );
      unsubscribe();
      resolveDone();
      throw new Error(errorMessage);
    }

    console.log(`[Codex Compact] Command sent for thread ${threadId}, waiting for completion...`);

    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const diagnostics = {
          threadId,
          cliAcknowledged,
          lastMessageTime: Date.now() - lastMessageTime,
          totalTime: Date.now() - compactStartTime,
        };
        console.error(`[Codex Compact] Timeout after ${COMPACT_TIMEOUT_MS}ms`, diagnostics);
        reject(
          new Error(
            `Compaction timed out after ${COMPACT_TIMEOUT_MS / 1000}s. ` +
            (cliAcknowledged
              ? 'CLI acknowledged but did not complete (stream may have stalled).'
              : 'CLI did not acknowledge the compact command.')
          )
        );
      }, COMPACT_TIMEOUT_MS);
    });

    // Race between completion and timeout
    try {
      await Promise.race([donePromise, timeoutPromise]);
    } catch (timeoutError) {
      // Timeout occurred - cleanup and rethrow
      unsubscribe();
      throw timeoutError;
    } finally {
      // Always cleanup subscription
      unsubscribe();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (failureMessage) {
      throw new Error(failureMessage);
    }

    emitEvent({
      event: 'plan',
      data: { message: 'Compact completed successfully.' },
    });
  } finally {
    // Always remove from active compacts set
    activeCompacts.delete(threadId);
  }
}

export async function getContextUsage(provider: string, payload: any) {
  if (provider === 'claude') {
    return await getClaudeContextUsage(payload.runtime?.claude);
  } else {
    return await getCodexContextUsage({
      cliPath: payload.runtime?.codex?.cliPath,
      envVars: payload.runtime?.codex?.envVars,
      threadId: payload.runtime?.codex?.threadId,
    });
  }
}
