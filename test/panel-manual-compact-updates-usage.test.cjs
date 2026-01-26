const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('manual compact updates context usage and respects done status', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const start = contents.indexOf('const onManualCompact = async () => {');
  assert.ok(start !== -1, 'expected onManualCompact');
  const chunk = contents.slice(start, start + 4000);

  // Compaction jobs can emit usage updates; UI should consume them so the ring updates.
  assert.match(chunk, /event\.event\s*===\s*['"]usage['"]/);

  // Compaction can fail; UI should not show a success message unconditionally.
  assert.match(chunk, /event\.data\?\.status/);
});

