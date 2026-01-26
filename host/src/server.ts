import Fastify from 'fastify';

import { registerHealth } from './routes/health.js';
import { registerHostTools } from './routes/hostTools.js';
import { registerJobs } from './routes/jobs.js';
import { registerRuntime } from './routes/runtime.js';
import registerSessionRoutes from './routes/sessions.js';

export function buildServer() {
  const server = Fastify({ logger: false });

  server.addHook('onRequest', (request, reply, done) => {
    const origin = request.headers.origin;
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
    }
    reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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
  void registerSessionRoutes(server);

  return server;
}
