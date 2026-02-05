const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel normalizes done status casing before deciding success/failure', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  const start = contents.indexOf("if (event.event === 'done')");
  assert.ok(start >= 0, 'expected done handler');
  const end = contents.indexOf('maybeFinalizeStream', start);
  assert.ok(end >= 0, 'expected maybeFinalizeStream call');
  const section = contents.slice(start, end);

  assert.match(section, /toLowerCase\(\)/);
});
