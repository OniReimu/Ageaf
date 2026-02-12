import type { Model } from '@mariozechner/pi-ai';

interface CustomProviderDef {
  envKey: string;
  models: Model<'openai-completions'>[];
}

const CUSTOM_PROVIDERS: Record<string, CustomProviderDef> = {
  deepseek: {
    envKey: 'DEEPSEEK_API_KEY',
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek V3',
        api: 'openai-completions',
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        reasoning: false,
        input: ['text'],
        cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0 },
        contextWindow: 64000,
        maxTokens: 8192,
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek R1',
        api: 'openai-completions',
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        reasoning: true,
        input: ['text'],
        cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0 },
        contextWindow: 64000,
        maxTokens: 8192,
      },
    ],
  },
  qwen: {
    envKey: 'DASHSCOPE_API_KEY',
    models: [
      {
        id: 'qwen-max',
        name: 'Qwen Max',
        api: 'openai-completions',
        provider: 'qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        compat: {
          thinkingFormat: 'qwen' as any,
          maxTokensField: 'max_tokens' as any,
        },
        reasoning: true,
        input: ['text'],
        cost: { input: 2.0, output: 6.0, cacheRead: 0.5, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        id: 'qwen-plus',
        name: 'Qwen Plus',
        api: 'openai-completions',
        provider: 'qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        compat: { maxTokensField: 'max_tokens' as any },
        reasoning: false,
        input: ['text'],
        cost: { input: 0.8, output: 2.0, cacheRead: 0.2, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        id: 'qwen-turbo',
        name: 'Qwen Turbo',
        api: 'openai-completions',
        provider: 'qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        compat: { maxTokensField: 'max_tokens' as any },
        reasoning: false,
        input: ['text'],
        cost: { input: 0.3, output: 0.6, cacheRead: 0.08, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  },
};

export function getCustomProviderApiKey(provider: string): string | undefined {
  const def = CUSTOM_PROVIDERS[provider];
  return def ? process.env[def.envKey] : undefined;
}

export function getCustomProviders(): Array<{ provider: string; hasApiKey: boolean }> {
  return Object.entries(CUSTOM_PROVIDERS).map(([name, def]) => ({
    provider: name,
    hasApiKey: Boolean(process.env[def.envKey]),
  }));
}

export function getCustomModels(provider: string): Model<any>[] {
  const def = CUSTOM_PROVIDERS[provider];
  if (!def || !process.env[def.envKey]) return [];
  return def.models;
}

export function getAllCustomModels(): Model<any>[] {
  const result: Model<any>[] = [];
  for (const [, def] of Object.entries(CUSTOM_PROVIDERS)) {
    if (process.env[def.envKey]) result.push(...def.models);
  }
  return result;
}

export function getCustomProviderEnvKeys(): string[] {
  return Object.values(CUSTOM_PROVIDERS).map((def) => def.envKey);
}

export function isCustomProvider(provider: string): boolean {
  return provider in CUSTOM_PROVIDERS;
}
