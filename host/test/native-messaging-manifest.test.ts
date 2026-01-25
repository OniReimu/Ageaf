import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('native messaging manifest template exists', () => {
  const manifestPath = path.join(
    __dirname,
    '..',
    'native-messaging',
    'manifest.template.json'
  );
  assert.ok(fs.existsSync(manifestPath));
});
