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

// ─── Active Codex job tracking ───
// Codex uses an out-of-process MCP stdio server that calls back via HTTP.
// Since the stdio server doesn't have ALS context, we correlate callbacks
// using the Codex CLI's process ID: the stdio server sends process.ppid
// and the host matches it against the registered appServer PID.
//
// Multiple jobs can share the same Codex CLI PID (app-servers are reused by
// config key), so we store a stack per PID. The runtime enforces a per-PID
// turn lock (see run.ts:acquirePidTurnLock) that serializes concurrent turns
// sharing the same app-server, so at most one entry per PID is active at a
// time. The stack is a defensive safety net, not a concurrency mechanism.
const activeCodexJobs = new Map<number, string[]>(); // Codex CLI PID → stack of jobIds

/** Mark a Codex job as actively executing a turn. Keyed by the Codex CLI PID. */
export function registerActiveCodexJob(pid: number, jobId: string): void {
  const stack = activeCodexJobs.get(pid);
  if (stack) {
    stack.push(jobId);
  } else {
    activeCodexJobs.set(pid, [jobId]);
  }
}

/** Remove a specific Codex job from the active set (turn completed). */
export function unregisterActiveCodexJob(pid: number, jobId: string): void {
  const stack = activeCodexJobs.get(pid);
  if (!stack) return;
  const idx = stack.indexOf(jobId);
  if (idx >= 0) stack.splice(idx, 1);
  if (stack.length === 0) activeCodexJobs.delete(pid);
}

/** Resolve a Codex job ID by the Codex CLI PID (from stdio server's process.ppid). */
export function resolveCodexJobByPid(ppid: number): string | null {
  const stack = activeCodexJobs.get(ppid);
  return stack?.length ? stack[stack.length - 1] : null;
}

/** Fallback: get any active Codex job ID when PID is unavailable. */
export function getActiveCodexJobId(): string | null {
  let last: string | null = null;
  for (const stack of activeCodexJobs.values()) {
    if (stack.length > 0) last = stack[stack.length - 1];
  }
  return last;
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
