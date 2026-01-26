const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Settings dialog has auto-compact toggle and manual button', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  // Check for auto-compact toggle
  assert.match(contents, /autoCompactEnabled/);
  assert.match(contents, /Auto-compact at 85% context usage/);

  // Check for manual compact button next to context usage
  assert.match(contents, /ageaf-runtime__compact-button/);
  assert.match(contents, /onManualCompact/);
  assert.match(contents, /Compact conversation/);

  // Check for state and handlers
  assert.match(contents, /setAutoCompactEnabled/);
  assert.match(contents, /onToggleAutoCompact/);

  // Check for confirmation dialog
  assert.match(contents, /window\.confirm/);
  assert.match(contents, /Chat history will be summarised/);

  // Check for chat messages during compaction
  assert.match(contents, /Chat compact in progress/);
  assert.match(contents, /Compaction complete/);
});
