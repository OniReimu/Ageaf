import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('native entrypoint exits when run interactively', () => {
  const entrypointPath = path.join(__dirname, '..', 'src', 'native.ts');
  const contents = fs.readFileSync(entrypointPath, 'utf8');
  assert.match(contents, /process\.stdin\.isTTY/);
  assert.match(contents, /process\.exit/);
});

