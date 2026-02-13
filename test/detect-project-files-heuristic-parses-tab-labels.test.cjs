const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('detectProjectFilesFromDom extracts filenames from noisy tab labels', () => {
  const target = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(target, 'utf8');

  const exportStart = contents.indexOf('export const detectProjectFilesFromDom');
  assert.ok(exportStart >= 0, 'expected exported detectProjectFilesFromDom');
  const exportBlock = contents.slice(exportStart, exportStart + 4000);

  assert.ok(
    exportBlock.includes('extractFilenameFromLabel'),
    'expected exported detectProjectFilesFromDom to use extractFilenameFromLabel()'
  );
  assert.ok(
    exportBlock.includes('match'),
    'expected exported detectProjectFilesFromDom to match filename patterns'
  );
  assert.ok(
    exportBlock.includes('buildTreePath'),
    'expected exported detectProjectFilesFromDom to include buildTreePath for folder-qualified paths'
  );
  assert.ok(
    exportBlock.includes('isTabLike') || exportBlock.includes('[role="tab"]'),
    'expected exported detectProjectFilesFromDom to detect tab-like nodes'
  );
});
