const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel checks latest main commit and renders a dismissible update banner', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /https:\/\/api\.github\.com\/repos\/OniReimu\/Ageaf\/commits\/main/
  );
  assert.match(contents, /ageaf-panel__update-banner/);
  assert.match(contents, /Dismiss update notification/);
  assert.match(contents, /There is a new version\. Please git pull and reload\./);
  assert.match(contents, /UPDATE_CHECK_INTERVAL_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(contents, /setInterval\(\(\)\s*=>\s*\{\s*void checkForUpdate\(\);\s*\},\s*UPDATE_CHECK_INTERVAL_MS\)/);
});

test('Constants include commit-based update storage keys', () => {
  const constantsPath = path.join(__dirname, '..', 'src', 'constants.ts');
  const contents = fs.readFileSync(constantsPath, 'utf8');

  assert.match(contents, /LOCAL_STORAGE_KEY_DISMISSED_UPDATE_COMMIT_SHA/);
  assert.match(contents, /LOCAL_STORAGE_KEY_LAST_SEEN_REMOTE_COMMIT_SHA/);
});
