const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('notation scan expands LaTeX input dependencies', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const start = contents.indexOf('const collectNotationAttachments = async');
  assert.ok(start >= 0, 'expected collectNotationAttachments');
  const end = contents.indexOf('const onNotationConsistencyPass', start);
  assert.ok(end >= 0, 'expected onNotationConsistencyPass after collector');
  const block = contents.slice(start, end);

  assert.match(
    block,
    /collectLatexInputPaths\(\s*content,\s*projectFiles,\s*entry\.path,\s*\{\s*includeUnresolvedCandidates:\s*true\s*\}\s*\)/,
    'notation scan should collect LaTeX input dependencies with unresolved fallback'
  );
  assert.match(
    block,
    /queue\.push\(/,
    'notation scan should enqueue discovered input files for scanning'
  );
});
