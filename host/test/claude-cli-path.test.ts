import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('resolveClaudeCliPath uses explicit cliPath when present', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-claude-'));
  const cliPath = path.join(tempDir, 'claude');
  fs.writeFileSync(cliPath, '#!/bin/sh\n');

  try {
    const { resolveClaudeCliPath } = await import('../src/runtimes/claude/cli.js');
    const resolved = resolveClaudeCliPath(cliPath, undefined);

    assert.equal(resolved, cliPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
