const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Pi provider uses ageaf-provider--pi CSS class', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /ageaf-provider--pi/,
    'Panel should use ageaf-provider--pi CSS class for pi provider'
  );
});

test('Pi provider indicator CSS exists in panel.css', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(
    contents,
    /\.ageaf-provider--pi\s+\.ageaf-provider__dot/,
    'panel.css should define .ageaf-provider--pi .ageaf-provider__dot'
  );
  assert.match(
    contents,
    /ageaf-provider-flash-pi/,
    'panel.css should define pi flash animation'
  );
});

test('PROVIDER_DISPLAY includes pi with BYOK label', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /pi:\s*\{\s*label:\s*['"]BYOK['"]\s*\}/,
    'PROVIDER_DISPLAY should include pi with BYOK label'
  );
});
