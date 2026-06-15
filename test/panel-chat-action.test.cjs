const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel sends chat action with user message', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /action:\s*JobAction\s*=\s*'chat'/);
  assert.match(contents, /message:\s*finalMessageText/);
  // Verify skill directive processing exists
  assert.match(contents, /processSkillDirectives/);
  assert.match(contents, /skillsPrompt/);
});

test('Panel prioritizes user custom prompt after injected skill directives', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /customSystemPrompt:\s*skillsPrompt[\s\S]*\$\{skillsPrompt\}[\s\S]*\$\{options\.customSystemPrompt \|\| ''\}/
  );
});
