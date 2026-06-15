import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Notation consistency workflow excludes .bib attachments from scan input', () => {
  const workflowPath = path.join(
    process.cwd(),
    'src',
    'workflows',
    'notationConsistency.ts'
  );
  const contents = fs.readFileSync(workflowPath, 'utf8');

  const match = contents.match(
    /const TEXT_FILE_EXTENSIONS = new Set\(\[([\s\S]*?)\]\);/
  );
  assert.ok(match, 'expected TEXT_FILE_EXTENSIONS definition');

  const block = match[1] ?? '';
  assert.doesNotMatch(block, /'\.bib'/, 'notation workflow should not include .bib');
});
