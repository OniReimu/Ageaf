import type { FastifyInstance } from 'fastify';

import { loadHostSettings, setHostToolsEnabled } from '../hostSettings.js';

export function registerHostTools(server: FastifyInstance) {
  server.get('/v1/host/tools', async (_request, reply) => {
    const settings = loadHostSettings();
    reply.send({
      toolsEnabled: settings.toolsEnabled,
      toolsAvailable: process.env.AGEAF_ENABLE_TOOLS === 'true',
      remoteToggleAllowed: process.env.AGEAF_ALLOW_REMOTE_TOOL_TOGGLE === 'true',
    });
  });

  server.post('/v1/host/tools', async (request, reply) => {
    if (process.env.AGEAF_ALLOW_REMOTE_TOOL_TOGGLE !== 'true') {
      reply.status(403).send({
        error: 'forbidden',
        message:
          'Remote tool toggling is disabled. Restart the host with AGEAF_ALLOW_REMOTE_TOOL_TOGGLE=true to allow the extension to enable/disable tools.',
      });
      return;
    }

    const body = request.body as { enabled?: unknown } | undefined;
    const enabled = body && typeof body.enabled === 'boolean' ? body.enabled : null;
    if (enabled === null) {
      reply.status(400).send({
        error: 'bad_request',
        message: 'Expected JSON body: { "enabled": boolean }',
      });
      return;
    }

    const settings = setHostToolsEnabled(enabled);
    reply.send({
      toolsEnabled: settings.toolsEnabled,
    });
  });
}


