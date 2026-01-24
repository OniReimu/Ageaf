import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getClaudeRuntimeStatus } from '../src/runtimes/claude/client.js';

test('getClaudeRuntimeStatus reports model from ~/.claude/settings.json when enabled', () => {
  const previousPath = process.env.AGEAF_CLAUDE_USER_SETTINGS_PATH;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-claude-settings-'));
  const settingsPath = path.join(tmpDir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({ model: 'sonnet' }));

  process.env.AGEAF_CLAUDE_USER_SETTINGS_PATH = settingsPath;
  try {
    const status = getClaudeRuntimeStatus({ loadUserSettings: true });
    assert.equal(status.model, 'sonnet');
    assert.equal(status.modelSource, 'claude_settings');
  } finally {
    if (previousPath === undefined) delete process.env.AGEAF_CLAUDE_USER_SETTINGS_PATH;
    else process.env.AGEAF_CLAUDE_USER_SETTINGS_PATH = previousPath;
  }
});

