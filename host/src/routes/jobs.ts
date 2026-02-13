import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

import { runClaudeJob } from '../runtimes/claude/run.js';
import { getCodexAppServer } from '../runtimes/codex/appServer.js';
import { runCodexJob, type CodexRuntimeConfig } from '../runtimes/codex/run.js';
import { runPiJob, type PiJobPayload } from '../runtimes/pi/run.js';
import type { PiRuntimeConfig } from '../runtimes/pi/agent.js';
import { startEventStream } from '../sse.js';
import type { JobEvent } from '../types.js';
import { validatePatch } from '../validate.js';
import { runRewriteSelection } from '../workflows/rewriteSelection.js';
import { runFixCompileError } from '../workflows/fixCompileError.js';
import { setLastClaudeRuntimeConfig } from '../runtimes/claude/state.js';
import type { ClaudeRuntimeConfig } from '../runtimes/claude/agent.js';
import { runWithJobContext, registerJobEmitter, unregisterJobEmitter, resolveAskUserRequest } from '../interactive/askUserCore.js';

type JobSubscriber = {
  send: (event: JobEvent) => void;
  end: () => void;
};

type JobRecord = {
  id: string;
  events: JobEvent[];
  subscribers: Set<JobSubscriber>;
  done: boolean;
  provider: 'claude' | 'codex' | 'pi';
  codex?: { cliPath?: string; envVars?: string; cwd: string };
};

const jobs = new Map<string, JobRecord>();

type JobRequestPayload = {
  provider?: 'claude' | 'codex' | 'pi';
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
  runtime?: { claude?: ClaudeRuntimeConfig; codex?: CodexRuntimeConfig; pi?: PiRuntimeConfig };
  userSettings?: {
    displayName?: string;
    customSystemPrompt?: string;
    enableCommandBlocklist?: boolean;
    blockedCommandsUnix?: string;
    debugCliEvents?: boolean;
  };
};


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
    const provider = payload.provider === 'codex' ? 'codex' : payload.provider === 'pi' ? 'pi' : 'claude';
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
      registerJobEmitter(id, emitEvent as (event: { event: string; data?: unknown }) => void);
      try {
        await runWithJobContext(id, async () => {
          emitEvent({ event: 'plan', data: { message: 'Job queued' } });

          if (provider === 'pi') {
            await runPiJob(payload as PiJobPayload, emitEvent);
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
            await runCodexJob(payload, emitEvent, { jobId: id });
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
        });
      } catch (error) {
        emitEvent({
          event: 'done',
          data: {
            status: 'error',
            message: error instanceof Error ? error.message : 'Job failed',
          },
        });
      } finally {
        unregisterJobEmitter(id);
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

    // Handle Pi / Claude ask_user responses
    if (job.provider === 'pi' || job.provider === 'claude') {
      const body = request.body as { requestId?: unknown; result?: unknown };
      const reqId = body?.requestId;
      if (typeof reqId !== 'string') {
        reply.status(400).send({ error: 'invalid_requestId' });
        return;
      }
      // Validate both jobId AND requestId — prevents cross-job resolution
      const resolved = resolveAskUserRequest(id, String(reqId), body.result);
      if (!resolved) {
        reply.status(404).send({ error: 'no_pending_request' });
        return;
      }
      reply.send({ ok: true });
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
export function createJobForTest(provider: 'claude' | 'codex' | 'pi') {
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

export function createDoneJobForTest(provider: 'claude' | 'codex' | 'pi') {
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
