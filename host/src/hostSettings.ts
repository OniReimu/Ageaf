import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type HostSettings = {
  toolsEnabled?: boolean;
};

const DEFAULT_SETTINGS: Required<HostSettings> = {
  toolsEnabled: false,
};

let cachedSettings: Required<HostSettings> | null = null;

export function getHostSettingsPath(): string {
  const override = process.env.AGEAF_HOST_SETTINGS_PATH;
  if (override && override.trim()) return override.trim();
  return path.join(os.homedir(), '.ageaf', 'host-settings.json');
}

export function loadHostSettings(): Required<HostSettings> {
  if (cachedSettings) return cachedSettings;
  const filename = getHostSettingsPath();
  try {
    const raw = fs.readFileSync(filename, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      cachedSettings = { ...DEFAULT_SETTINGS };
      return cachedSettings;
    }
    const record = parsed as Record<string, unknown>;
    cachedSettings = {
      toolsEnabled:
        typeof record.toolsEnabled === 'boolean'
          ? record.toolsEnabled
          : DEFAULT_SETTINGS.toolsEnabled,
    };
    return cachedSettings;
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
    return cachedSettings;
  }
}

export function saveHostSettings(next: Required<HostSettings>) {
  const filename = getHostSettingsPath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  cachedSettings = next;
}

export function setHostToolsEnabled(enabled: boolean): Required<HostSettings> {
  const current = loadHostSettings();
  const next = { ...current, toolsEnabled: enabled };
  saveHostSettings(next);
  return next;
}


