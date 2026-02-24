const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel reserves /compact from skill autocomplete and directive loading', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /isReservedSlashCommand/);
  assert.match(contents, /if \(isReservedSlashCommand\(query\)\) return null;/);
  assert.match(
    contents,
    /if \(isReservedSlashCommand\(normalized\)\) \{\s*continue;\s*\}/s
  );
});

test('Panel closes skill menu when slash query has no matching skills', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /if \(results\.length === 0\) \{\s*setSkillOpen\(false\);\s*setSkillResults\(\[\]\);\s*skillRangeRef\.current = null;\s*return;\s*\}/s
  );
});

test('clearEditor always closes mention and skill overlays', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /const clearEditor = \(\) => \{[\s\S]*setMentionOpen\(false\);[\s\S]*setMentionResults\(\[\]\);[\s\S]*mentionRangeRef\.current = null;[\s\S]*setSkillOpen\(false\);[\s\S]*setSkillResults\(\[\]\);[\s\S]*skillRangeRef\.current = null;[\s\S]*\};/s
  );
});
