const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Status line toggles CoT when both exist (no duplicate header)', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-message__status--toggle/);
  assert.match(contents, /hideHeader:\s*isStatusCoTToggle/);
  assert.match(contents, /toggleThinkingExpanded\(message\.id\)/);

  // Streaming: reuse the status line as the toggle instead of showing a second header.
  assert.match(contents, /toggleThinkingExpanded\('streaming-thinking'\)/);
  assert.match(contents, /hideHeader:\s*isStreamingCoTToggle/);
});
