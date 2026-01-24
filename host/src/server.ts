import Fastify from 'fastify';

import { registerHealth } from './routes/health.js';
import { registerHostTools } from './routes/hostTools.js';
import { registerJobs } from './routes/jobs.js';
import { registerRuntime } from './routes/runtime.js';

export function buildServer() {
  const server = Fastify({ logger: false });

  server.addHook('onRequest', (request, reply, done) => {
    const origin = request.headers.origin;
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
    }
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'content-type');

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
      return;
    }

    done();
  });

  registerHealth(server);
  registerHostTools(server);
  registerJobs(server);
  registerRuntime(server);

  return server;
}

if (process.env.AGEAF_START_SERVER !== 'false') {
  const server = buildServer();
  const port = Number(process.env.PORT ?? 3210);
  const host = process.env.HOST ?? '127.0.0.1';

  server
    .listen({ port, host })
    .then((address) => {
      console.log(`Ageaf host listening on ${address}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
