import { config as dotenvConfig } from 'dotenv';
import { getCustomProviderEnvKeys } from './runtimes/pi/customProviders.js';

/**
 * All provider API key env vars that pi-ai checks via getEnvApiKey().
 * Clearing these before re-reading .env ensures that removed keys
 * are properly unset (dotenv only sets/overrides, never deletes).
 */
const PROVIDER_ENV_KEYS = [
  'OPENAI_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'CEREBRAS_API_KEY',
  'XAI_API_KEY',
  'OPENROUTER_API_KEY',
  'AI_GATEWAY_API_KEY',
  'ZAI_API_KEY',
  'MISTRAL_API_KEY',
  'MINIMAX_API_KEY',
  'MINIMAX_CN_API_KEY',
  'HF_TOKEN',
  'OPENCODE_API_KEY',
  'KIMI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_OAUTH_TOKEN',
];

/**
 * Re-read .env with proper cleanup: delete all known provider API keys
 * from process.env first, then let dotenv set only the ones in the file.
 * This ensures that removing a key from .env actually removes it.
 */
export function reloadDotenv(): void {
  const allKeys = [...PROVIDER_ENV_KEYS, ...getCustomProviderEnvKeys()];
  for (const key of allKeys) {
    delete process.env[key];
  }
  dotenvConfig({ override: true });
}
