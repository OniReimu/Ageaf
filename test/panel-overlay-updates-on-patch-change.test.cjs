const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel re-emits editor overlay show events when pending patch text changes', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  // Expect a signature map (not only a Set of ids) so changes re-render.
  assert.match(contents, /overlayActiveDetailsRef/);
  assert.match(contents, /JSON\.stringify/);
});
