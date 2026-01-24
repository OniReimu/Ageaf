import type { FastifyReply } from 'fastify';

import type { JobEvent } from './types.js';

export function serializeEvent(event: JobEvent) {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function startEventStream(reply: FastifyReply) {
  const origin = reply.request.headers.origin;
  if (origin) {
    reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Vary', 'Origin');
  }
  reply.raw.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  reply.raw.setHeader('Access-Control-Allow-Headers', 'content-type');
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  reply.raw.flushHeaders?.();

  return {
    send: (event: JobEvent) => {
      reply.raw.write(serializeEvent(event));
    },
    end: () => {
      reply.raw.end();
    },
  };
}

export function sendEvents(reply: FastifyReply, events: JobEvent[]) {
  const stream = startEventStream(reply);
  for (const event of events) {
    stream.send(event);
  }
  stream.end();
}
