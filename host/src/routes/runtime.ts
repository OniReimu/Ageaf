import type { FastifyInstance } from 'fastify';
import { reloadDotenv } from '../reloadDotenv.js';

import { getClaudeRuntimeStatus } from '../runtimes/claude/client.js';
import { getClaudeContextUsage } from '../runtimes/claude/context.js';
import { getClaudeSupportedModels } from '../runtimes/claude/metadata.js';
import {
  getClaudePreferences,
  getThinkingModes,
  updateClaudePreferences,
} from '../runtimes/claude/preferences.js';
import { getLastClaudeRuntimeConfig } from '../runtimes/claude/state.js';
import { getCodexRuntimeMetadata } from '../runtimes/codex/metadata.js';
import { getCodexContextUsage } from '../runtimes/codex/context.js';
import { getPiAvailableModels, getPiThinkingLevels } from '../runtimes/pi/metadata.js';
import { getPiPreferences, updatePiPreferences } from '../runtimes/pi/preferences.js';
import { getPiContextUsage } from '../runtimes/pi/context.js';
import { getPiRuntimeStatus } from '../runtimes/pi/client.js';

export function registerRuntime(server: FastifyInstance) {
  server.get('/v1/runtime/claude/metadata', async (_request, reply) => {
    const preferences = getClaudePreferences();
    const runtimeStatus = getClaudeRuntimeStatus({
      model: preferences.model ?? undefined,
    });
    const models = await getClaudeSupportedModels({
      model: preferences.model ?? undefined,
      loadUserSettings: true,
    });
    const fallbackModel =
      models.find((model) => model.value.toLowerCase().includes('sonnet')) ??
      models[0] ??
      null;

    reply.send({
      models,
      currentModel: preferences.model ?? runtimeStatus.model ?? fallbackModel?.value ?? null,
      modelSource: runtimeStatus.modelSource,
      thinkingModes: getThinkingModes(),
      currentThinkingMode: preferences.thinkingMode,
      maxThinkingTokens: preferences.maxThinkingTokens,
    });
  });

  server.get('/v1/runtime/claude/context', async (request, reply) => {
    const query = request.query as { sessionScope?: unknown } | undefined;
    const requestedScope =
      query && typeof query.sessionScope === 'string'
        ? query.sessionScope.trim().toLowerCase()
        : null;
    const sessionScope =
      requestedScope === 'home' || requestedScope === 'project'
        ? (requestedScope as 'home' | 'project')
        : null;

    const preferences = getClaudePreferences();
    const lastRuntime = getLastClaudeRuntimeConfig();
    const runtime = {
      ...(lastRuntime ?? {}),
      model: preferences.model ?? lastRuntime?.model,
      loadUserSettings: lastRuntime?.loadUserSettings ?? true,
      sessionScope: sessionScope ?? lastRuntime?.sessionScope,
    };

    const usage = await getClaudeContextUsage(runtime);
    reply.send(usage);
  });

  server.post('/v1/runtime/claude/preferences', async (request, reply) => {
    const body = request.body as {
      model?: string | null;
      thinkingMode?: string | null;
    };

    const preferences = updateClaudePreferences(body ?? {});
    const runtimeStatus = getClaudeRuntimeStatus({
      model: preferences.model ?? undefined,
    });

    reply.send({
      currentModel: preferences.model ?? runtimeStatus.model,
      modelSource: runtimeStatus.modelSource,
      currentThinkingMode: preferences.thinkingMode,
      maxThinkingTokens: preferences.maxThinkingTokens,
    });
  });

  server.post('/v1/runtime/codex/metadata', async (request, reply) => {
    const body = request.body as { cliPath?: unknown; envVars?: unknown } | undefined;
    const cliPath = body && typeof body.cliPath === 'string' ? body.cliPath : undefined;
    const envVars = body && typeof body.envVars === 'string' ? body.envVars : undefined;

    const metadata = await getCodexRuntimeMetadata({ cliPath, envVars });
    reply.send(metadata);
  });

  server.post('/v1/runtime/codex/context', async (request, reply) => {
    const body = request.body as {
      cliPath?: unknown;
      envVars?: unknown;
      threadId?: unknown;
    } | undefined;
    const cliPath = body && typeof body.cliPath === 'string' ? body.cliPath : undefined;
    const envVars = body && typeof body.envVars === 'string' ? body.envVars : undefined;
    const threadId = body && typeof body.threadId === 'string' ? body.threadId : undefined;

    const usage = await getCodexContextUsage({ cliPath, envVars, threadId });
    reply.send(usage);
  });

  // --- Pi runtime endpoints ---

  server.get('/v1/runtime/pi/metadata', async (_request, reply) => {
    // Re-read .env so API key changes (additions AND removals) take effect.
    reloadDotenv();
    const status = getPiRuntimeStatus();
    const models = getPiAvailableModels();
    const preferences = getPiPreferences();
    const currentModel = preferences.model ?? status.activeModel ?? (models[0]?.value ?? null);
    const thinkingLevels = getPiThinkingLevels(currentModel);

    reply.send({
      models,
      currentModel,
      currentProvider: preferences.provider ?? status.activeProvider,
      availableProviders: status.availableProviders,
      thinkingLevels,
      currentThinkingLevel: preferences.thinkingLevel,
    });
  });

  server.post('/v1/runtime/pi/preferences', async (request, reply) => {
    const body = request.body as {
      provider?: string | null;
      model?: string | null;
      thinkingLevel?: string | null;
    };

    const preferences = updatePiPreferences(body ?? {});
    const status = getPiRuntimeStatus();
    const currentModel = preferences.model ?? status.activeModel;
    const thinkingLevels = getPiThinkingLevels(currentModel);

    // Auto-downgrade thinking level if current level is not supported by the new model
    const supportedIds = new Set(thinkingLevels.map((l) => l.id));
    if (!supportedIds.has(preferences.thinkingLevel)) {
      const downgraded = thinkingLevels[thinkingLevels.length - 1]?.id ?? 'off';
      updatePiPreferences({ thinkingLevel: downgraded });
    }

    const finalPreferences = getPiPreferences();

    reply.send({
      currentProvider: finalPreferences.provider ?? status.activeProvider,
      currentModel,
      currentThinkingLevel: finalPreferences.thinkingLevel,
      thinkingLevels,
    });
  });

  server.get('/v1/runtime/pi/context', async (request, reply) => {
    const query = request.query as { conversationId?: unknown } | undefined;
    const conversationId =
      query && typeof query.conversationId === 'string'
        ? query.conversationId.trim()
        : '';

    if (!conversationId) {
      reply.send({
        configured: true,
        model: null,
        usedTokens: 0,
        contextWindow: null,
        percentage: null,
      });
      return;
    }

    const usage = getPiContextUsage(conversationId);
    reply.send(usage);
  });
}
