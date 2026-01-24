import type { FastifyInstance } from 'fastify';

import { getClaudeRuntimeStatus } from '../runtimes/claude/client.js';

export function registerHealth(server: FastifyInstance) {
  server.get('/v1/health', async () => ({
    status: 'ok',
    claude: getClaudeRuntimeStatus(),
  }));
}
