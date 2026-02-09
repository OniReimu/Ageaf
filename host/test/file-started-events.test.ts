import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// NOTE: These are structural smoke tests. Behavioral coverage lives in
// codex-runtime-file-update.test.ts where events are asserted at runtime.
test('JobEvent type includes file_started', () => {
  const typesPath = path.join(process.cwd(), 'src', 'types.ts');
  const contents = fs.readFileSync(typesPath, 'utf8');
  assert.match(contents, /'file_started'/);
});

test('Claude runtime emits file_started for AGEAF_FILE_UPDATE markers', () => {
  const agentPath = path.join(
    process.cwd(),
    'src',
    'runtimes',
    'claude',
    'agent.ts'
  );
  const contents = fs.readFileSync(agentPath, 'utf8');

  assert.match(contents, /event:\s*'file_started'/);
  assert.match(contents, /const fileUpdateOpenRe = /);
  assert.match(contents, /fileUpdateOpenRe\.lastIndex = 0/);
  assert.match(contents, /AGEAF_FILE_UPDATE/);
});

test('Codex runtime emits file_started for AGEAF_FILE_UPDATE markers', () => {
  const runPath = path.join(
    process.cwd(),
    'src',
    'runtimes',
    'codex',
    'run.ts'
  );
  const contents = fs.readFileSync(runPath, 'utf8');

  assert.match(contents, /event:\s*'file_started'/);
  assert.match(contents, /const fileUpdateOpenRe = /);
  assert.match(contents, /fileUpdateOpenRe\.lastIndex = 0/);
  assert.match(contents, /AGEAF_FILE_UPDATE/);
});
