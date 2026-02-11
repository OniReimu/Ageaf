const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Pi YOLO toggle is no-op — onToggleYoloMode returns early for pi', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  // The onToggleYoloMode function should return immediately for pi
  assert.match(
    contents,
    /if\s*\(\s*chatProvider\s*===\s*['"]pi['"]\s*\)\s*return/,
    'onToggleYoloMode should return early when chatProvider is pi'
  );
});

test('Pi YOLO toggle button is disabled for pi provider', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  // The YOLO button should have disabled={chatProvider === 'pi'}
  assert.match(
    contents,
    /disabled=\{chatProvider\s*===\s*['"]pi['"]\}/,
    'YOLO button should be disabled when chatProvider is pi'
  );
});
