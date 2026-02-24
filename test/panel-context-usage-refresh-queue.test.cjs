const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel queues a pending context usage refresh when one is already in flight', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /const contextRefreshPendingRef = useRef<\{\s*provider\?: ProviderId;\s*conversationId\?: string \| null;\s*force\?: boolean;\s*\} \| null>\(null\);/s);
  assert.match(
    contents,
    /if \(contextRefreshInFlightRef\.current\) \{\s*const pending = contextRefreshPendingRef\.current;[\s\S]*contextRefreshPendingRef\.current = \{[\s\S]*force: Boolean\(params\?\.force\) \|\| Boolean\(pending\?\.force\),[\s\S]*\};\s*return;\s*\}/s
  );
  assert.match(
    contents,
    /const pendingRefresh = contextRefreshPendingRef\.current;\s*contextRefreshPendingRef\.current = null;\s*if \(pendingRefresh\) \{\s*void refreshContextUsage\(pendingRefresh\);\s*\}/s
  );
});
