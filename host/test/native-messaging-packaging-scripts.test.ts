import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('macOS packaging script does not claim binary output without pkg', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'pkg', 'build-macos.sh');
  const contents = fs.readFileSync(scriptPath, 'utf8');
  assert.equal(/Built host at/.test(contents), false);
  assert.match(contents, /Host JS built at/);
});
