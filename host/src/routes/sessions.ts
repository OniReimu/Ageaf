import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getCodexAppServer } from '../runtimes/codex/appServer.js';
import { evictPiSession } from '../runtimes/pi/run.js';

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

      if (provider !== 'claude' && provider !== 'codex' && provider !== 'pi') {
        return reply.status(400).send({ error: 'Invalid provider. Must be "claude", "codex", or "pi".' });
      }

      if (!sessionId || !sessionId.trim()) {
        return reply.status(400).send({ error: 'Session ID is required.' });
      }

      const trimmedId = sessionId.trim();
      const sessionDir = path.join(os.homedir(), '.ageaf', provider, 'sessions', trimmedId);

      try {
        // Evict Pi agent session (if applicable)
        if (provider === 'pi') {
          try {
            evictPiSession(trimmedId);
          } catch (error) {
            console.error(`Failed to evict Pi session ${trimmedId}:`, error);
          }
        }

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
  // Codex doesn't have a built-in "delete thread" command.
  // The session directory cleanup is the primary cleanup mechanism.
  // 
  // We intentionally don't try to spawn the Codex app server here because:
  // 1. It can fail if Codex CLI is not installed/configured
  // 2. The app server spawn can crash the host if not properly handled
  // 3. Session directory deletion is sufficient for cleanup
  //
  // If Codex adds thread deletion support in the future, implement it here
  // with proper error handling and app server lifecycle management.
  
  // For now, this is a no-op. Session directory deletion happens in the caller.
}

