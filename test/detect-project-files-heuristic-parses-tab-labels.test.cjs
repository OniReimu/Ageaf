const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('detectProjectFilesHeuristic extracts filenames from noisy tab labels', () => {
  const target = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(target, 'utf8');

  const exportStart = contents.indexOf('export const detectProjectFilesHeuristic');
  assert.ok(exportStart >= 0, 'expected exported detectProjectFilesHeuristic');
  const exportBlock = contents.slice(exportStart, exportStart + 2500);

  assert.ok(
    exportBlock.includes('extractFilenameFromLabel'),
    'expected exported detectProjectFilesHeuristic to use extractFilenameFromLabel()'
  );
  assert.ok(
    exportBlock.includes('match'),
    'expected exported detectProjectFilesHeuristic to match filename patterns'
  );
});

