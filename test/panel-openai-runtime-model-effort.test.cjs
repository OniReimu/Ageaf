const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('OpenAI provider payload includes model and reasoning effort', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /provider:\s*'codex'[\s\S]*runtime:\s*\{\s*codex:\s*\{[\s\S]*model:/);
  assert.match(
    contents,
    /provider:\s*'codex'[\s\S]*runtime:\s*\{\s*codex:\s*\{[\s\S]*reasoningEffort:/
  );
});

