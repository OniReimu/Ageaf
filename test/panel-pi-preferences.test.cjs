const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Pi preferences update calls updatePiRuntimePreferences (not Claude/Codex)', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /if\s*\(\s*chatProvider\s*===\s*['"]pi['"]\s*\)\s*\{[\s\S]*?updatePiRuntimePreferences/,
    'applyRuntimePreferences should call updatePiRuntimePreferences for pi provider'
  );
});

test('Pi preferences maps ultra to xhigh before sending to host', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  // The applyRuntimePreferences pi branch should map ultra -> xhigh
  assert.match(
    contents,
    /thinkingLevel:\s*payload\.thinkingMode\s*===\s*['"]ultra['"]\s*\?\s*['"]xhigh['"]/,
    'Pi preferences should map ultra to xhigh in applyRuntimePreferences'
  );
});

test('Pi job payload maps ultra to xhigh for thinkingLevel', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  // The pi payload construction should map ultra -> xhigh
  assert.match(
    contents,
    /currentThinkingMode\s*===\s*['"]ultra['"]\s*\?\s*['"]xhigh['"]/,
    'Pi job payload should map ultra to xhigh for thinking level'
  );
});
