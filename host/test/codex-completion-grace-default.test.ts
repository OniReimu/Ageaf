import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Codex completion grace default is one hour', () => {
  const runPath = path.join(process.cwd(), 'src', 'runtimes', 'codex', 'run.ts');
  const contents = fs.readFileSync(runPath, 'utf8');

  assert.match(contents, /const DEFAULT_CODEX_COMPLETION_GRACE_MS = 60 \* 60 \* 1000;/);
});
