import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getCodexAppServer } from '../runtimes/codex/appServer.js';

type DeleteSessionParams = {
  provider: string;
  sessionId: string;
};

/**
 * DELETE /v1/sessions/:provider/:sessionId
 *
 * Deletes a session directory and associated runtime state:
 * - For Claude: Removes ~/.ageaf/claude/sessions/{sessionId}
 * - For Codex: Removes ~/.ageaf/codex/sessions/{sessionId} + deletes thread
 */
export default async function registerSessionRoutes(server: FastifyInstance) {
  server.delete<{ Params: DeleteSessionParams }>(
    '/v1/sessions/:provider/:sessionId',
    async (request, reply) => {
      const { provider, sessionId } = request.params;

      if (provider !== 'claude' && provider !== 'codex') {
        return reply.status(400).send({ error: 'Invalid provider. Must be "claude" or "codex".' });
      }

      if (!sessionId || !sessionId.trim()) {
        return reply.status(400).send({ error: 'Session ID is required.' });
      }

      const trimmedId = sessionId.trim();
      const sessionDir = path.join(os.homedir(), '.ageaf', provider, 'sessions', trimmedId);

      try {
        // Delete Codex thread first (if applicable)
        if (provider === 'codex') {
          try {
            await deleteCodexThread(trimmedId);
          } catch (error) {
            // Log but don't fail the entire operation if thread deletion fails
            console.error(`Failed to delete Codex thread ${trimmedId}:`, error);
          }
        }

        // Delete session directory
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }

        return reply.send({ success: true, sessionId: trimmedId, provider });
      } catch (error) {
        console.error(`Failed to delete session ${provider}/${trimmedId}:`, error);
        return reply.status(500).send({
          error: 'Failed to delete session',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}

async function deleteCodexThread(threadId: string): Promise<void> {
  // Codex doesn't have a built-in "delete thread" command, but we can try
  // to use the app server API if it exists. For now, this is a placeholder.
  // The session directory cleanup is the primary cleanup mechanism.
  
  // Attempt to get app server and issue a deletion request (if supported)
  try {
    const sessionCwd = path.join(os.homedir(), '.ageaf', 'codex', 'sessions', threadId);
    const appServer = await getCodexAppServer({
      cwd: sessionCwd,
    });

    // Note: As of current Codex CLI, there's no native "delete thread" RPC.
    // This is a placeholder for future API support. The primary cleanup is
    // the session directory removal.
    
    // If Codex adds thread deletion support in the future, implement here:
    // await appServer.request('thread/delete', { threadId });
    
  } catch (error) {
    // Silently fail - session directory cleanup is sufficient
    console.warn(`Could not delete Codex thread ${threadId} via API (not critical):`, error);
  }
}

