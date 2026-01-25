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

  const send = (message: NativeHostResponse) => {
    output.write(encodeNativeMessage(message));
  };

  input.on('data', async (chunk: Buffer) => {
    const { messages, carry: nextCarry } = decodeNativeMessages(
      Buffer.concat([carry, chunk])
    );
    carry = nextCarry;

    for (const message of messages) {
      const request = message as NativeHostRequest;
      if (request?.kind !== 'request') continue;

      if (request.request.stream && /\/v1\/jobs\/[^/]+\/events$/.test(request.request.path)) {
        const match = request.request.path.match(/\/v1\/jobs\/([^/]+)\/events/);
        const jobId = match?.[1];
        if (!jobId) {
          send({ id: request.id, kind: 'error', message: 'invalid_job_id' });
          continue;
        }

        const subscription = subscribeToJobEvents(jobId, {
          send: (event) => send({ id: request.id, kind: 'event', event }),
          end: () => send({ id: request.id, kind: 'end' }),
        });

        if (!subscription.ok) {
          send({ id: request.id, kind: 'error', message: subscription.error });
        }
        continue;
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

        send({
          id: request.id,
          kind: 'response',
          status: reply.statusCode,
          headers: reply.headers as Record<string, string>,
          body,
        });
      } catch (error) {
        send({
          id: request.id,
          kind: 'error',
          message: error instanceof Error ? error.message : 'native_host_error',
        });
      }
    }
  });
}
