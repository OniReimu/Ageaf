import assert from 'node:assert/strict';
import { describe, test, beforeEach, afterEach } from 'node:test';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  getCustomProviderApiKey,
  getCustomProviders,
  getCustomModels,
  getAllCustomModels,
  getCustomProviderEnvKeys,
  isCustomProvider,
} from '../src/runtimes/pi/customProviders.js';
import { resolveModel, makeApiKeyResolver } from '../src/runtimes/pi/agent.js';
import type { ResolveModelResult } from '../src/runtimes/pi/agent.js';
import { getPiRuntimeStatus } from '../src/runtimes/pi/client.js';
import { getModels } from '@mariozechner/pi-ai';
import { buildServer } from '../src/server.js';

// ── Env var save/restore ─────────────────────────────────────
const ENV_KEYS_TO_SAVE = [
  'DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY', 'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY',
  'MISTRAL_API_KEY', 'AGEAF_PI_PROVIDER', 'AGEAF_PI_MODEL',
];

let savedEnv: Record<string, string | undefined>;

function saveEnv() {
  savedEnv = {};
  for (const key of ENV_KEYS_TO_SAVE) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

// ── Model definition tests ───────────────────────────────────

describe('customProviders: model definitions', () => {
  test('all custom models have required fields', () => {
    // Set keys so models are returned
    process.env.DEEPSEEK_API_KEY = 'test';
    process.env.DASHSCOPE_API_KEY = 'test';
    try {
      const models = getAllCustomModels();
      assert.ok(models.length >= 5, `expected at least 5 custom models, got ${models.length}`);
      for (const m of models) {
        assert.ok(m.id, `model missing id`);
        assert.ok(m.name, `model ${m.id} missing name`);
        assert.ok(m.api, `model ${m.id} missing api`);
        assert.ok(m.provider, `model ${m.id} missing provider`);
        assert.ok(m.baseUrl, `model ${m.id} missing baseUrl`);
        assert.ok(typeof m.contextWindow === 'number', `model ${m.id} missing contextWindow`);
        assert.ok(typeof m.maxTokens === 'number', `model ${m.id} missing maxTokens`);
      }
    } finally {
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.DASHSCOPE_API_KEY;
    }
  });

  test('DeepSeek baseUrl includes deepseek.com', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    try {
      const models = getCustomModels('deepseek');
      for (const m of models) {
        assert.ok(m.baseUrl?.includes('deepseek.com'), `${m.id} baseUrl should include deepseek.com`);
      }
    } finally {
      delete process.env.DEEPSEEK_API_KEY;
    }
  });

  test('Qwen Max has compat.thinkingFormat === qwen', () => {
    process.env.DASHSCOPE_API_KEY = 'test';
    try {
      const models = getCustomModels('qwen');
      const qwenMax = models.find(m => m.id === 'qwen-max');
      assert.ok(qwenMax, 'qwen-max should exist');
      assert.equal((qwenMax as any).compat?.thinkingFormat, 'qwen');
    } finally {
      delete process.env.DASHSCOPE_API_KEY;
    }
  });

  test('all Qwen models have compat.maxTokensField === max_tokens', () => {
    process.env.DASHSCOPE_API_KEY = 'test';
    try {
      const models = getCustomModels('qwen');
      for (const m of models) {
        assert.equal((m as any).compat?.maxTokensField, 'max_tokens', `${m.id} should use max_tokens`);
      }
    } finally {
      delete process.env.DASHSCOPE_API_KEY;
    }
  });

  test('deepseek-reasoner is reasoning, deepseek-chat is not', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    try {
      const models = getCustomModels('deepseek');
      const chat = models.find(m => m.id === 'deepseek-chat');
      const reasoner = models.find(m => m.id === 'deepseek-reasoner');
      assert.equal(chat?.reasoning, false);
      assert.equal(reasoner?.reasoning, true);
    } finally {
      delete process.env.DEEPSEEK_API_KEY;
    }
  });

  test('isCustomProvider returns true for deepseek and qwen, false for openai', () => {
    assert.equal(isCustomProvider('deepseek'), true);
    assert.equal(isCustomProvider('qwen'), true);
    assert.equal(isCustomProvider('openai'), false);
  });
});

// ── API key resolution tests ─────────────────────────────────

describe('customProviders: API key resolution', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  test('getCustomProviderApiKey returns undefined without env var', () => {
    assert.equal(getCustomProviderApiKey('deepseek'), undefined);
  });

  test('getCustomProviderApiKey returns value when DEEPSEEK_API_KEY set', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key-123';
    assert.equal(getCustomProviderApiKey('deepseek'), 'test-key-123');
  });

  test('getCustomProviderApiKey returns undefined for non-custom provider', () => {
    assert.equal(getCustomProviderApiKey('openai'), undefined);
  });

  test('getCustomModels returns [] without key, returns models with key', () => {
    assert.deepEqual(getCustomModels('deepseek'), []);
    process.env.DEEPSEEK_API_KEY = 'test';
    assert.equal(getCustomModels('deepseek').length, 2);
  });

  test('getCustomModels returns [] for unknown provider', () => {
    assert.deepEqual(getCustomModels('unknown'), []);
  });

  test('getAllCustomModels returns empty without keys, returns all when set', () => {
    assert.equal(getAllCustomModels().length, 0);
    process.env.DEEPSEEK_API_KEY = 'test';
    process.env.DASHSCOPE_API_KEY = 'test';
    assert.ok(getAllCustomModels().length >= 5);
  });

  test('getCustomProviderEnvKeys returns expected keys', () => {
    const keys = getCustomProviderEnvKeys();
    assert.ok(keys.includes('DEEPSEEK_API_KEY'));
    assert.ok(keys.includes('DASHSCOPE_API_KEY'));
  });
});

// ── resolveModel tests ───────────────────────────────────────

describe('resolveModel: explicit provider via config', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  test('deepseek provider + key → deepseek-chat', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    const result = resolveModel({ provider: 'deepseek' });
    assert.equal(result.model?.id, 'deepseek-chat');
  });

  test('deepseek provider + model + key → deepseek-reasoner', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    const result = resolveModel({ provider: 'deepseek', model: 'deepseek-reasoner' });
    assert.equal(result.model?.id, 'deepseek-reasoner');
  });

  test('deepseek provider + no key → null with failReason', () => {
    const result = resolveModel({ provider: 'deepseek' });
    assert.equal(result.model, null);
    assert.ok(result.failReason?.includes('deepseek'), `failReason should mention provider: ${result.failReason}`);
  });

  test('deepseek provider + wrong key only → null (no fallback)', () => {
    process.env.OPENAI_API_KEY = 'test';
    const result = resolveModel({ provider: 'deepseek' });
    assert.equal(result.model, null);
  });

  test('deepseek provider + model typo + key → null with failReason', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    const result = resolveModel({ provider: 'deepseek', model: 'deepseek-typo' });
    assert.equal(result.model, null);
    assert.ok(result.failReason?.includes('"deepseek-typo"'));
  });
});

describe('resolveModel: auto-detect with custom providers', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  test('DEEPSEEK_API_KEY only → auto-detects deepseek-chat', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    const result = resolveModel();
    assert.equal(result.model?.id, 'deepseek-chat');
  });

  test('config.model=qwen-max + DASHSCOPE_API_KEY → qwen-max', () => {
    process.env.DASHSCOPE_API_KEY = 'test';
    const result = resolveModel({ model: 'qwen-max' });
    assert.equal(result.model?.id, 'qwen-max');
  });
});

describe('resolveModel: config modelId soft-fail (stale UI)', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  test('config.model=nonexistent + OPENAI_API_KEY → falls through to auto-detect', () => {
    process.env.OPENAI_API_KEY = 'test';
    const result = resolveModel({ model: 'nonexistent' });
    assert.ok(result.model !== null, 'should fall through to auto-detect');
  });

  test('config.model=qwen-max + DEEPSEEK_API_KEY (no DASHSCOPE) → graceful fallback', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    const result = resolveModel({ model: 'qwen-max' });
    assert.equal(result.model?.id, 'deepseek-chat', 'should fall back to deepseek-chat');
  });
});

describe('resolveModel: non-preferred built-in providers (regression guard)', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  test('config.model with groq key → finds groq model', () => {
    let groqModels;
    try {
      groqModels = getModels('groq' as any);
    } catch { /* skip if groq not in registry */ }
    if (!groqModels || groqModels.length === 0) return; // skip

    const groqModelId = groqModels[0].id;
    process.env.GROQ_API_KEY = 'test';
    const result = resolveModel({ model: groqModelId });
    assert.equal(result.model?.id, groqModelId);
  });

  test('config.model with mistral key → finds mistral model', () => {
    let mistralModels;
    try {
      mistralModels = getModels('mistral' as any);
    } catch { /* skip if mistral not in registry */ }
    if (!mistralModels || mistralModels.length === 0) return; // skip

    const mistralModelId = mistralModels[0].id;
    process.env.MISTRAL_API_KEY = 'test';
    const result = resolveModel({ model: mistralModelId });
    assert.equal(result.model?.id, mistralModelId);
  });
});

describe('resolveModel: env var overrides are ignored (regression guard)', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  test('AGEAF_PI_PROVIDER/MODEL env vars have no effect on auto-detect', () => {
    process.env.AGEAF_PI_PROVIDER = 'deepseek';
    process.env.AGEAF_PI_MODEL = 'deepseek-reasoner';
    process.env.OPENAI_API_KEY = 'test';
    // No DEEPSEEK_API_KEY — if env vars were read, it would try deepseek and fail
    // Instead, auto-detect should pick OpenAI
    const result = resolveModel();
    assert.ok(result.model !== null, 'should auto-detect a model');
    assert.notEqual(result.model?.provider, 'deepseek', 'should not pick deepseek from env');
  });

  test('AGEAF_PI_PROVIDER env var does not override config.provider', () => {
    process.env.AGEAF_PI_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'test';
    process.env.OPENAI_API_KEY = 'test';
    const result = resolveModel({ provider: 'openai' });
    assert.ok(result.model !== null, 'should resolve a model');
    assert.equal(result.model?.provider, 'openai', 'config.provider should win over env');
  });
});

describe('resolveModel: failReason messages', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  test('model typo with explicit provider', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    const result = resolveModel({ provider: 'deepseek', model: 'typo' });
    assert.ok(result.failReason?.includes('Model "typo" not found for provider "deepseek"'));
  });

  test('unknown provider', () => {
    const result = resolveModel({ provider: 'unknown' });
    assert.ok(result.failReason?.includes('Provider "unknown" not found'));
  });

  test('no keys at all', () => {
    const result = resolveModel();
    assert.ok(result.failReason?.includes('No API key found'));
  });
});

// ── makeApiKeyResolver tests ─────────────────────────────────

describe('makeApiKeyResolver', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  test('resolves custom provider key', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const resolver = makeApiKeyResolver();
    assert.equal(resolver('deepseek'), 'test-key');
  });

  test('falls through to getEnvApiKey for built-in providers', () => {
    process.env.OPENAI_API_KEY = 'oai-key';
    const resolver = makeApiKeyResolver();
    assert.equal(resolver('openai'), 'oai-key');
  });

  test('returns undefined for unknown provider', () => {
    const resolver = makeApiKeyResolver();
    assert.equal(resolver('unknown-provider'), undefined);
  });
});

// ── getPiRuntimeStatus tests ─────────────────────────────────

describe('getPiRuntimeStatus: custom providers', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  test('includes deepseek with hasApiKey:true when key is set', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    const status = getPiRuntimeStatus();
    const ds = status.availableProviders.find(p => p.provider === 'deepseek');
    assert.ok(ds, 'deepseek should be in availableProviders');
    assert.equal(ds?.hasApiKey, true);
  });

  test('includes deepseek with hasApiKey:false when no key', () => {
    const status = getPiRuntimeStatus();
    const ds = status.availableProviders.find(p => p.provider === 'deepseek');
    assert.ok(ds, 'deepseek should be in availableProviders');
    assert.equal(ds?.hasApiKey, false);
  });

  test('configured is true when only custom provider key is set', () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    const status = getPiRuntimeStatus();
    assert.equal(status.configured, true);
  });

  test('AGEAF_PI_PROVIDER/MODEL env vars have no effect on status', () => {
    process.env.AGEAF_PI_PROVIDER = 'override-provider';
    process.env.AGEAF_PI_MODEL = 'override-model';
    process.env.OPENAI_API_KEY = 'test';
    const status = getPiRuntimeStatus();
    assert.notEqual(status.activeProvider, 'override-provider', 'env override should be ignored');
    assert.equal(status.activeModel, null, 'activeModel should be null (no env override)');
  });
});

// ── Metadata endpoint integration tests ──────────────────────
// The route handler calls reloadDotenv() which clears all known provider keys
// from process.env then re-reads .env. Tests write a controlled .env fixture
// per test so results are independent of the developer's local .env.

const DOT_ENV_PATH = resolve(import.meta.dirname, '../.env');
const CUSTOM_KEY_NAMES = ['DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY'];

function saveDotEnv(): { content: string; existed: boolean } {
  try {
    return { content: readFileSync(DOT_ENV_PATH, 'utf-8'), existed: true };
  } catch {
    return { content: '', existed: false };
  }
}

function restoreDotEnv(snapshot: { content: string; existed: boolean }) {
  if (!snapshot.existed) {
    try { unlinkSync(DOT_ENV_PATH); } catch { /* already gone */ }
  } else {
    writeFileSync(DOT_ENV_PATH, snapshot.content, 'utf-8');
  }
}

/** Build a .env fixture from the original content with custom keys stripped,
 *  then append only the extra lines the test needs. */
function writeDotEnvFixture(
  original: string,
  extraLines: string[],
) {
  const cleaned = original
    .split('\n')
    .filter((line) => !CUSTOM_KEY_NAMES.some((k) => line.trimStart().startsWith(k + '=')))
    .join('\n');
  const fixture = cleaned + (extraLines.length ? '\n' + extraLines.join('\n') + '\n' : '');
  writeFileSync(DOT_ENV_PATH, fixture, 'utf-8');
}

describe('metadata endpoint: custom providers', () => {
  let dotEnvSnapshot: { content: string; existed: boolean };

  beforeEach(() => {
    saveEnv();
    dotEnvSnapshot = saveDotEnv();
  });
  afterEach(() => {
    restoreDotEnv(dotEnvSnapshot);
    restoreEnv();
  });

  test('DEEPSEEK_API_KEY → metadata includes deepseek models', async () => {
    writeDotEnvFixture(dotEnvSnapshot.content, ['DEEPSEEK_API_KEY=test']);
    const server = buildServer();
    try {
      const res = await server.inject({ method: 'GET', url: '/v1/runtime/pi/metadata' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      const dsModels = body.models.filter((m: any) => m.provider === 'deepseek');
      assert.ok(dsModels.length >= 2, `expected at least 2 deepseek models, got ${dsModels.length}`);
      const ids = dsModels.map((m: any) => m.value);
      assert.ok(ids.includes('deepseek-chat'));
      assert.ok(ids.includes('deepseek-reasoner'));
    } finally {
      await server.close();
    }
  });

  test('DASHSCOPE_API_KEY → metadata includes qwen models', async () => {
    writeDotEnvFixture(dotEnvSnapshot.content, ['DASHSCOPE_API_KEY=test']);
    const server = buildServer();
    try {
      const res = await server.inject({ method: 'GET', url: '/v1/runtime/pi/metadata' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      const qwenModels = body.models.filter((m: any) => m.provider === 'qwen');
      assert.ok(qwenModels.length >= 3, `expected at least 3 qwen models, got ${qwenModels.length}`);
      const ids = qwenModels.map((m: any) => m.value);
      assert.ok(ids.includes('qwen-max'));
      assert.ok(ids.includes('qwen-plus'));
      assert.ok(ids.includes('qwen-turbo'));
    } finally {
      await server.close();
    }
  });

  test('without custom keys → no deepseek or qwen in metadata', async () => {
    writeDotEnvFixture(dotEnvSnapshot.content, []);
    const server = buildServer();
    try {
      const res = await server.inject({ method: 'GET', url: '/v1/runtime/pi/metadata' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      const customModels = body.models.filter(
        (m: any) => m.provider === 'deepseek' || m.provider === 'qwen'
      );
      assert.equal(customModels.length, 0, 'should have no custom provider models without keys');
    } finally {
      await server.close();
    }
  });
});
