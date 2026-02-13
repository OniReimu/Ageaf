import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

// ─── Types ───
export type EmitEvent = (event: { event: string; data?: unknown }) => void;

export type AskUserQuestion = {
  id: string;
  header?: string;
  question: string;
  options?: { label: string; description?: string }[];
};

// Matches panel's canonical response shape (Panel.tsx:8523-8531)
export type AskUserResult = {
  answers: Record<string, { answers: string[] }>;
};

// ─── AsyncLocalStorage for job context ───
// Set once in jobs.ts dispatch; read by tool handlers anywhere downstream.
// Eliminates all module-level mutable state. Concurrent-safe by design.
const jobContext = new AsyncLocalStorage<{ jobId: string }>();

/** Wrap a job's async work to make jobId available to all downstream code. */
export function runWithJobContext<T>(jobId: string, fn: () => T): T {
  return jobContext.run({ jobId }, fn);
}

/** Read current job's ID from ALS. Returns null outside a job context. */
export function getCurrentJobId(): string | null {
  return jobContext.getStore()?.jobId ?? null;
}

// ─── Per-job emitter registry ───
const jobEmitters = new Map<string, EmitEvent>();
const pendingRequests = new Map<string, {
  resolve: (result: AskUserResult) => void;
  jobId: string;
  timer: ReturnType<typeof setTimeout>;
}>();

const ASK_USER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Register an emitter for a job. Call before running the job. */
export function registerJobEmitter(jobId: string, emit: EmitEvent): void {
  jobEmitters.set(jobId, emit);
}

/** Unregister emitter when job completes. Also cleans up orphaned pending requests. */
export function unregisterJobEmitter(jobId: string): void {
  jobEmitters.delete(jobId);
  for (const [reqId, entry] of pendingRequests) {
    if (entry.jobId === jobId) {
      clearTimeout(entry.timer);
      entry.resolve({ answers: {} });
      pendingRequests.delete(reqId);
    }
  }
}

/**
 * Normalize and validate the raw /respond payload into AskUserResult.
 * Tolerates missing/malformed fields instead of crashing.
 */
function validateAskUserResult(raw: unknown): AskUserResult {
  if (raw == null || typeof raw !== 'object') return { answers: {} };
  const obj = raw as Record<string, unknown>;
  const answers = obj.answers;
  if (answers == null || typeof answers !== 'object') return { answers: {} };

  const result: AskUserResult['answers'] = {};
  for (const [key, val] of Object.entries(answers as Record<string, unknown>)) {
    if (val != null && typeof val === 'object' && 'answers' in (val as any)) {
      const arr = (val as any).answers;
      result[key] = { answers: Array.isArray(arr) ? arr.filter((v: unknown) => typeof v === 'string') : [] };
    } else {
      result[key] = { answers: [] };
    }
  }
  return { answers: result };
}

/**
 * Called by /v1/jobs/:id/respond endpoint.
 * Validates BOTH jobId and requestId to prevent cross-job resolution.
 * Returns false if no matching pending request.
 */
export function resolveAskUserRequest(
  jobId: string,
  requestId: string,
  result: unknown,
): boolean {
  const entry = pendingRequests.get(requestId);
  if (!entry) return false;
  if (entry.jobId !== jobId) return false; // cross-job protection
  clearTimeout(entry.timer);
  pendingRequests.delete(requestId);
  entry.resolve(validateAskUserResult(result)); // validated, not raw cast
  return true;
}

/**
 * Called by Pi tool execute() and Claude MCP handler.
 * Reads jobId from AsyncLocalStorage — no module-level state needed.
 * Blocks until user responds, times out, or signal aborts.
 */
export async function executeAskUser(
  questions: AskUserQuestion[],
  signal?: AbortSignal,
): Promise<AskUserResult> {
  // Handle pre-aborted signal immediately — prevents registering listeners/emitting events
  if (signal?.aborted) return { answers: {} };

  const jobId = getCurrentJobId();
  if (!jobId) throw new Error('ask_user: no active job context (missing AsyncLocalStorage)');

  const emit = jobEmitters.get(jobId);
  if (!emit) throw new Error(`ask_user: no emitter registered for job ${jobId}`);

  const requestId = `ask-${crypto.randomUUID()}`;

  return new Promise<AskUserResult>((resolve) => {
    // Cleanup helper — removes abort listener + timer on any resolution path
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    };

    const wrappedResolve = (result: AskUserResult) => {
      cleanup();
      resolve(result);
    };

    const timer = setTimeout(() => {
      wrappedResolve({ answers: {} });
    }, ASK_USER_TIMEOUT_MS);

    const onAbort = () => {
      wrappedResolve({ answers: {} });
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    pendingRequests.set(requestId, { resolve: wrappedResolve, jobId, timer });

    // Emit SSE event — format matches Panel.tsx:6467-6489 tool_call handler
    emit({
      event: 'tool_call',
      data: {
        kind: 'user_input',
        requestId,
        method: 'ask_user',
        params: { questions },
      },
    });
  });
}
