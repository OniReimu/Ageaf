const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Escape interruption appends an INTERRUPTED BY USER line styled with accent color', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const panel = fs.readFileSync(panelPath, 'utf8');

  assert.match(panel, /INTERRUPTED BY USER/);
  assert.match(panel, /ageaf-message__interrupt/);
  assert.match(panel, /\$\{partial\}[\s\S]*INTERRUPTED_BY_USER_MARKER/);

  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /\.ageaf-message__interrupt\s*\{[^}]*color:\s*var\(--ageaf-panel-accent\)/s);
  assert.match(css, /\.ageaf-message__interrupt\s*\{[^}]*display:\s*inline-block/s);
  assert.match(css, /\.ageaf-message__interrupt\s*\{[^}]*margin:\s*0/s);
});
