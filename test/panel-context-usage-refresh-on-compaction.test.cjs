const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel tracks compaction completion and force-refreshes Claude context usage on finalize', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /didCompactContext:\s*boolean;/);
  assert.match(contents, /didCompactContext:\s*false,/);
  assert.match(contents, /sessionState\.didCompactContext = false;/);
  assert.match(
    contents,
    /if \(phase === 'compaction_complete'\) \{\s*sessionState\.didCompactContext = true;\s*\}/s
  );
  assert.match(
    contents,
    /const forceContextRefresh = sessionState\.didCompactContext;[\s\S]*refreshContextUsage\(\{\s*provider,\s*conversationId,\s*force: forceContextRefresh,\s*\}\);/s
  );
});

