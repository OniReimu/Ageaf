const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Settings exposes separate toggles for thinking/tools vs CLI trace', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  const thinkingIdx = contents.indexOf('Show thinking and tool activity');
  assert.ok(thinkingIdx >= 0, 'expected thinking/tools toggle label');
  const thinkingSection = contents.slice(Math.max(0, thinkingIdx - 400), thinkingIdx + 400);
  assert.match(thinkingSection, /settings\.showThinkingAndTools/);
  assert.match(thinkingSection, /showThinkingAndTools:\s*event\.currentTarget\.checked/);

  const traceIdx = contents.indexOf('Debug CLI events');
  assert.ok(traceIdx >= 0, 'expected debug CLI events toggle label');
  const traceSection = contents.slice(Math.max(0, traceIdx - 500), traceIdx + 500);
  assert.match(traceSection, /settings\.debugCliEvents/);
  assert.match(traceSection, /debugCliEvents:\s*event\.currentTarget\.checked/);
});

