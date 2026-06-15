import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Claude agent forwards replaceRangeInFile patches without recomputing offsets', () => {
  const agentPath = path.join(
    process.cwd(),
    'src',
    'runtimes',
    'claude',
    'agent.ts'
  );
  const contents = fs.readFileSync(agentPath, 'utf8');

  assert.doesNotMatch(
    contents,
    /computePerHunkReplacements\(pd\.filePath,\s*pd\.expectedOldText,\s*pd\.text\)/
  );
  assert.match(contents, /emitEvent\(\{\s*event:\s*'patch',\s*data:\s*pd\s*\}\);/);
});
