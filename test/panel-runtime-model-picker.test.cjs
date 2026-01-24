const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Model picker uses Sonnet default and no Default option', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.doesNotMatch(contents, /Use the Claude Code default model\./);
});

test('Model picker button does not include a "Model" label', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.doesNotMatch(contents, /ageaf-runtime__label\">Model/);
});

test('Model picker menu uses fixed non-version labels and descriptions', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /Most capable for complex work/);
  assert.match(contents, /Best for everyday task/);
  assert.match(contents, /Fastest for quick answers/);
});
