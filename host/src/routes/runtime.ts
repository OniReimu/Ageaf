import type { FastifyInstance } from 'fastify';

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
}
