import type { FastifyInstance } from 'fastify';
import { decodeNativeMessages, encodeNativeMessage } from './nativeMessaging/protocol.js';
import { subscribeToJobEvents } from './routes/jobs.js';
import type { JobEvent } from './types.js';

export type NativeHostRequest = {
  id: string;
  kind: 'request';
  request: {
    method: 'GET' | 'POST';
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
    stream?: boolean;
  };
};

export type NativeHostResponse =
  | { id: string; kind: 'response'; status: number; body?: unknown; headers?: Record<string, string> }
  | { id: string; kind: 'event'; event: JobEvent }
  | { id: string; kind: 'end' }
  | { id: string; kind: 'error'; message: string };

export function runNativeMessagingHost({
  server,
  input = process.stdin,
  output = process.stdout,
}: {
  server: FastifyInstance;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}) {
  let carry = Buffer.alloc(0);
  const activeSubscriptions = new Map<string, () => void>();
  let processingChain = Promise.resolve();

  const send = (message: NativeHostResponse) => {
    output.write(encodeNativeMessage(message));
  };

  const cleanup = () => {
    for (const unsubscribe of activeSubscriptions.values()) {
      unsubscribe();
    }
    activeSubscriptions.clear();
  };

  const processMessage = async (request: NativeHostRequest) => {
    if (request.kind !== 'request') return;

    if (request.request.stream && /\/v1\/jobs\/[^/]+\/events$/.test(request.request.path)) {
      const match = request.request.path.match(/\/v1\/jobs\/([^/]+)\/events/);
      const jobId = match?.[1];
      if (!jobId) {
        send({ id: request.id, kind: 'error', message: 'invalid_job_id' });
        return;
      }

      const subscription = subscribeToJobEvents(jobId, {
        send: (event) => send({ id: request.id, kind: 'event', event }),
        end: () => {
          send({ id: request.id, kind: 'end' });
          activeSubscriptions.delete(request.id);
        },
      });

      if (!subscription.ok) {
        send({ id: request.id, kind: 'error', message: subscription.error });
        return;
      }

      if (subscription.done) {
        // Already completed, no cleanup needed
        return;
      }

      // Track subscription for cleanup
      activeSubscriptions.set(request.id, subscription.unsubscribe);
      return;
    }

    try {
      const reply = await server.inject({
        method: request.request.method,
        url: request.request.path,
        payload: request.request.body,
        headers: request.request.headers,
      });

      const bodyText = reply.body;
      let body: unknown = bodyText;
      try {
        body = bodyText ? JSON.parse(bodyText) : undefined;
      } catch {
        body = bodyText;
      }

      // Normalize headers to string values only
      const normalizedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(reply.headers)) {
        if (typeof value === 'string') {
          normalizedHeaders[key] = value;
        } else if (Array.isArray(value)) {
          normalizedHeaders[key] = value.join(', ');
        } else if (typeof value === 'number') {
          normalizedHeaders[key] = String(value);
        }
      }

      send({
        id: request.id,
        kind: 'response',
        status: reply.statusCode,
        headers: normalizedHeaders,
        body,
      });
    } catch (error) {
      send({
        id: request.id,
        kind: 'error',
        message: error instanceof Error ? error.message : 'native_host_error',
      });
    }
  };

  input.on('data', (chunk: Buffer) => {
    const { messages, carry: nextCarry } = decodeNativeMessages(Buffer.concat([carry, chunk]));
    carry = nextCarry;

    for (const message of messages) {
      processingChain = processingChain
        .then(() => processMessage(message as NativeHostRequest))
        .catch((error) => {
          console.error('Native messaging host processing error:', error);
        });
    }
  });

  input.on('end', cleanup);
  input.on('close', cleanup);
  input.on('error', cleanup);
}
