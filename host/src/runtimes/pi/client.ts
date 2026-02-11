import { getProviders, getEnvApiKey } from '@mariozechner/pi-ai';

export type PiRuntimeStatus = {
  configured: boolean;
  availableProviders: Array<{ provider: string; hasApiKey: boolean }>;
  activeProvider: string | null;
  activeModel: string | null;
  mock: boolean;
};

export function getPiRuntimeStatus(): PiRuntimeStatus {
  if (process.env.AGEAF_PI_MOCK === 'true') {
    return {
      configured: true,
      availableProviders: [{ provider: 'mock', hasApiKey: true }],
      activeProvider: 'mock',
      activeModel: 'mock',
      mock: true,
    };
  }

  const providers = getProviders();
  const availableProviders = providers.map((provider) => ({
    provider,
    hasApiKey: Boolean(getEnvApiKey(provider)),
  }));

  const configured = availableProviders.some((p) => p.hasApiKey);

  // Auto-detect active provider: prefer anthropic > openai > google > first with key
  const preferred = ['anthropic', 'openai', 'google'];
  let activeProvider: string | null = null;
  for (const pref of preferred) {
    const match = availableProviders.find((p) => p.provider === pref && p.hasApiKey);
    if (match) {
      activeProvider = match.provider;
      break;
    }
  }
  if (!activeProvider) {
    const firstWithKey = availableProviders.find((p) => p.hasApiKey);
    if (firstWithKey) activeProvider = firstWithKey.provider;
  }

  // Environment variable overrides
  const envProvider = process.env.AGEAF_PI_PROVIDER?.trim();
  if (envProvider) activeProvider = envProvider;

  const envModel = process.env.AGEAF_PI_MODEL?.trim() ?? null;

  return {
    configured,
    availableProviders,
    activeProvider,
    activeModel: envModel,
    mock: false,
  };
}
