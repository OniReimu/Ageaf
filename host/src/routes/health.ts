import type { FastifyInstance } from 'fastify';
import { reloadDotenv } from '../reloadDotenv.js';

import { getClaudeRuntimeStatus } from '../runtimes/claude/client.js';
import { getPiRuntimeStatus } from '../runtimes/pi/client.js';

export function registerHealth(server: FastifyInstance) {
  server.get('/v1/health', async () => {
    // Re-read .env so API key changes (additions AND removals) take effect.
    reloadDotenv();
    return {
      status: 'ok',
      claude: getClaudeRuntimeStatus(),
      pi: getPiRuntimeStatus(),
    };
  });
}
