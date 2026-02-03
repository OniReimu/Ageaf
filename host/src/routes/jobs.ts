import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

import { runClaudeJob } from '../runtimes/claude/run.js';
import { getCodexAppServer } from '../runtimes/codex/appServer.js';
import { runCodexJob, type CodexRuntimeConfig } from '../runtimes/codex/run.js';
import { startEventStream } from '../sse.js';
import type { JobEvent } from '../types.js';
import { validatePatch } from '../validate.js';
import { runRewriteSelection } from '../workflows/rewriteSelection.js';
import { runFixCompileError } from '../workflows/fixCompileError.js';
import { setLastClaudeRuntimeConfig } from '../runtimes/claude/state.js';
import type { ClaudeRuntimeConfig } from '../runtimes/claude/agent.js';
import { sendCompactCommand, getContextUsage } from '../compaction/sendCompact.js';

type JobSubscriber = {
  send: (event: JobEvent) => void;
  end: () => void;
};

type JobRecord = {
  id: string;
  events: JobEvent[];
  subscribers: Set<JobSubscriber>;
  done: boolean;
  provider: 'claude' | 'codex';
  codex?: { cliPath?: string; envVars?: string; cwd: string };
};

const jobs = new Map<string, JobRecord>();

type JobRequestPayload = {
  provider?: 'claude' | 'codex';
  action?: string;
  context?: {
    selection?: string;
    surroundingBefore?: string;
    surroundingAfter?: string;
    compileLog?: string;
    message?: string;
    images?: Array<{
      id: string;
      name: string;
      mediaType: string;
      data: string;
      size: number;
    }>;
    attachments?: Array<{
      id?: string;
      path?: string;
      name?: string;
      ext?: string;
      sizeBytes?: number;
      lineCount?: number;
      content?: string;
    }>;
  };
  runtime?: { claude?: ClaudeRuntimeConfig; codex?: CodexRuntimeConfig };
  userSettings?: {
    displayName?: string;
    customSystemPrompt?: string;
    enableTools?: boolean;
    enableCommandBlocklist?: boolean;
    blockedCommandsUnix?: string;
    autoCompactEnabled?: boolean;
    debugCliEvents?: boolean;
  };
  compaction?: {
    requestCompaction: boolean;
  };
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return promise as any;
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
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

export function registerJobs(server: FastifyInstance) {
  server.post('/v1/jobs', async (request, reply) => {
    const id = crypto.randomUUID();
    const job: JobRecord = {
      id,
      events: [],
      subscribers: new Set(),
      done: false,
      provider: 'claude',
    };
    jobs.set(id, job);

    const emitEvent = (event: JobEvent) => {
      if (event.event === 'patch') {
        event.data = validatePatch(event.data);
      }

      job.events.push(event);

      for (const subscriber of job.subscribers) {
        subscriber.send(event);
      }

      if (event.event === 'done') {
        job.done = true;
        for (const subscriber of job.subscribers) {
          subscriber.end();
        }
        job.subscribers.clear();
      }
    };

    const payload = request.body as JobRequestPayload;
    const provider = payload.provider === 'codex' ? 'codex' : 'claude';
    job.provider = provider;
    if (provider === 'claude' && payload.runtime?.claude) {
      setLastClaudeRuntimeConfig(payload.runtime.claude);
    }
    if (provider === 'codex') {
      const threadId = payload.runtime?.codex?.threadId;
      const sessionCwd = threadId
        ? path.join(os.homedir(), '.ageaf', 'codex', 'sessions', threadId.trim())
        : ensureAgeafWorkspaceCwd();
      try {
        fs.mkdirSync(sessionCwd, { recursive: true });
      } catch {
        // ignore
      }
      job.codex = {
        cliPath: payload.runtime?.codex?.cliPath,
        envVars: payload.runtime?.codex?.envVars,
        cwd: sessionCwd,
      };
    }
    reply.send({ jobId: id });

    void (async () => {
      try {
        emitEvent({ event: 'plan', data: { message: 'Job queued' } });

        // Auto-compaction check
        const autoCompactEnabled = payload.userSettings?.autoCompactEnabled ?? false;
        if (autoCompactEnabled && payload.compaction?.requestCompaction !== true) {
          let observedUsage: any | null = null;
          try {
            emitEvent({ event: 'plan', data: { message: 'Checking context usage…' } });
            const usage = await withTimeout(getContextUsage(provider, payload), 5000);
            observedUsage = usage;
            if (!usage) {
              emitEvent({
                event: 'plan',
                data: { message: 'Auto-compact skipped: context usage check timed out.' },
              });
            }
            if (usage && usage.percentage && usage.percentage >= 85) {
              emitEvent({
                event: 'plan',
                data: { message: `Context at ${usage.percentage}%. Auto-compacting...` },
              });

              await sendCompactCommand(provider, payload, emitEvent);

              // Refresh usage from the runtime after compaction so the client indicator updates.
              try {
                const nextUsage = await getContextUsage(provider, payload);
                if (nextUsage) {
                  emitEvent({
                    event: 'usage',
                    data: {
                      model: nextUsage.model ?? null,
                      usedTokens: nextUsage.usedTokens ?? 0,
                      contextWindow: nextUsage.contextWindow ?? null,
                    },
                  });
                }
              } catch (error) {
                // Ignore usage refresh failures; continue with the request.
                console.error('Post-compaction usage refresh failed:', error);
              }

              emitEvent({
                event: 'plan',
                data: { message: 'Compaction complete. Processing your request...' },
              });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Auto-compaction failed';
            emitEvent({
              event: 'plan',
              data: { message: `Auto-compaction failed: ${errorMessage}` },
            });
            console.error('Auto-compaction failed:', error);

            // At very high context usage, continuing is likely to stall without a successful compaction.
            if (provider === 'codex' && Number(observedUsage?.percentage ?? 0) >= 95) {
              emitEvent({
                event: 'done',
                data: {
                  status: 'error',
                  message:
                    `Auto-compaction failed at ${observedUsage?.percentage}%. ` +
                    'Please try manual compaction or start a new conversation.',
                },
              });
              return;
            }
          }
        }

        // Manual compaction request
        if (payload.compaction?.requestCompaction === true) {
          emitEvent({ event: 'plan', data: { message: 'Compacting...' } });
          try {
            await sendCompactCommand(provider, payload, emitEvent);
            // Refresh usage from the runtime after compaction so the client indicator updates.
            try {
              const nextUsage = await getContextUsage(provider, payload);
              if (nextUsage) {
                emitEvent({
                  event: 'usage',
                  data: {
                    model: nextUsage.model ?? null,
                    usedTokens: nextUsage.usedTokens ?? 0,
                    contextWindow: nextUsage.contextWindow ?? null,
                  },
                });
              }
            } catch (error) {
              // Ignore usage refresh failures; compaction itself may still have succeeded.
              console.error('Post-compaction usage refresh failed:', error);
            }
            emitEvent({ event: 'done', data: { status: 'ok', message: 'Compaction complete' } });
          } catch (error) {
            emitEvent({
              event: 'done',
              data: {
                status: 'error',
                message: error instanceof Error ? error.message : 'Compaction failed',
              },
            });
          }
          return;
        }

        if (provider === 'codex') {
          const action = payload.action ?? 'chat';
          if (action !== 'chat' && action !== 'rewrite' && action !== 'fix_error') {
            emitEvent({
              event: 'done',
              data: {
                status: 'error',
                message: `Unsupported action for OpenAI provider: ${action}`,
              },
            });
            return;
          }
          await runCodexJob(payload, emitEvent);
          return;
        }

        if (payload.action === 'rewrite') {
          await runRewriteSelection(payload, emitEvent);
          return;
        }
        if (payload.action === 'fix_error') {
          await runFixCompileError(payload, emitEvent);
          return;
        }

        await runClaudeJob(payload, emitEvent);
      } catch (error) {
        emitEvent({
          event: 'done',
          data: {
            status: 'error',
            message: error instanceof Error ? error.message : 'Job failed',
          },
        });
      }
    })();
  });

  server.post('/v1/jobs/:id/respond', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = jobs.get(id);
    if (!job) {
      reply.status(404).send({ error: 'not_found' });
      return;
    }

    if (job.provider !== 'codex' || !job.codex) {
      reply.status(400).send({ error: 'unsupported' });
      return;
    }

    const body = request.body as { requestId?: unknown; result?: unknown };
    const requestId = body?.requestId;
    if (typeof requestId !== 'number' && typeof requestId !== 'string') {
      reply.status(400).send({ error: 'invalid_requestId' });
      return;
    }

    try {
      const appServer = await getCodexAppServer(job.codex);
      await appServer.respond(requestId, body.result);
      reply.send({ ok: true });
    } catch (error) {
      reply.status(500).send({
        error: 'failed',
        message: error instanceof Error ? error.message : 'Failed to respond',
      });
    }
  });

  server.get('/v1/jobs/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = jobs.get(id);
    if (!job) {
      reply.status(404).send({ error: 'not_found' });
      return;
    }

    const stream = startEventStream(reply);
    for (const event of job.events) {
      stream.send(event);
    }

    if (job.done) {
      stream.end();
      return;
    }

    job.subscribers.add(stream);
    reply.raw.on('close', () => {
      job.subscribers.delete(stream);
    });
  });
}

export function subscribeToJobEvents(jobId: string, subscriber: JobSubscriber) {
  const job = jobs.get(jobId);
  if (!job) return { ok: false as const, error: 'not_found' as const };

  for (const event of job.events) subscriber.send(event);
  if (job.done) {
    subscriber.end();
    return { ok: true as const, done: true as const };
  }

  job.subscribers.add(subscriber);
  return {
    ok: true as const,
    done: false as const,
    unsubscribe: () => job.subscribers.delete(subscriber),
  };
}

// Test-only helpers
export function createJobForTest(provider: 'claude' | 'codex') {
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    events: [{ event: 'plan', data: { message: 'Job queued' } }],
    subscribers: new Set(),
    done: false,
    provider,
  });
  return id;
}

export function createDoneJobForTest(provider: 'claude' | 'codex') {
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    events: [
      { event: 'plan', data: { message: 'Job queued' } },
      { event: 'done', data: { status: 'complete' } },
    ],
    subscribers: new Set(),
    done: true,
    provider,
  });
  return id;
}

export function subscribeToJobEventsForTest(jobId: string, subscriber: JobSubscriber) {
  const result = subscribeToJobEvents(jobId, subscriber);
  return result.ok && !result.done ? result.unsubscribe : undefined;
}
