const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Runtime pickers adapt to provider-specific metadata', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /chatProvider\s*===\s*'codex'/);
  assert.match(contents, /await\s+fetchCodexRuntimeMetadata\(/);
  assert.match(contents, /supportedReasoningEfforts/);
});

test('Claude runtime UI avoids stale non-Claude model fallback', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /CLAUDE_FALLBACK_MODELS/);
  assert.match(contents, /setRuntimeModels\(CLAUDE_FALLBACK_MODELS\)/);
});
