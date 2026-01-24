const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

const LEGACY_FILES = [
  'src/iso/toolbar.ts',
  'src/iso/contentScript.css',
  'src/components/Toolbar.tsx',
  'src/components/ToolbarEditor.tsx',
  'src/components/Icon.tsx',
  'src/components/IconSelect.tsx',
  'src/components/FindSimilar.tsx',
  'src/components/FindSimilarPage.tsx',
  'src/components/styles/Toolbar.css',
  'src/components/styles/ToolbarEditor.css',
  'src/components/styles/IconSelect.css',
  'src/components/styles/FindSimilar.css',
  'src/components/styles/FindSimilarPage.css',
  'src/common/suggestion.ts',
  'src/utils/suggestion.ts',
  'src/utils/improvement.ts',
  'public/similar.html',
];

test('Legacy toolbar/suggestion files are removed', () => {
  for (const relativePath of LEGACY_FILES) {
    const absolutePath = path.join(ROOT, relativePath);
    assert.equal(
      fs.existsSync(absolutePath),
      false,
      `${relativePath} should be removed`
    );
  }
});

test('Content scripts no longer reference legacy toolbar/suggestion events', () => {
  const isoContentScript = fs.readFileSync(
    path.join(ROOT, 'src', 'iso', 'contentScript.ts'),
    'utf8'
  );
  const mainContentScript = fs.readFileSync(
    path.join(ROOT, 'src', 'main', 'contentScript.ts'),
    'utf8'
  );

  const forbidden = [
    'copilot:editor:update',
    'copilot:editor:select',
    'copilot:cursor:update',
    'copilot-toolbar',
    'copilot-toolbar-editor',
    'Suggestion',
    'showToolbar',
  ];

  for (const token of forbidden) {
    assert.equal(
      isoContentScript.includes(token),
      false,
      `iso content script should not reference ${token}`
    );
    assert.equal(
      mainContentScript.includes(token),
      false,
      `main content script should not reference ${token}`
    );
  }
});

test('Settings and options omit legacy suggestion/toolbar fields', () => {
  const panel = fs.readFileSync(
    path.join(ROOT, 'src', 'iso', 'panel', 'Panel.tsx'),
    'utf8'
  );
  const types = fs.readFileSync(path.join(ROOT, 'src', 'types.ts'), 'utf8');

  assert.equal(panel.includes('Disable inline suggestions'), false);
  assert.equal(panel.includes('Disable selection toolbar'), false);
  assert.equal(panel.includes('Hide search icon in toolbar'), false);
  assert.equal(panel.includes('advanced'), false);

  const forbiddenFields = [
    'suggestionMaxOutputToken',
    'suggestionPrompt',
    'suggestionDisabled',
    'toolbarActions',
    'toolbarSearchDisabled',
    'toolbarDisabled',
    'apiKey',
    'apiBaseUrl',
    'model?: string',
  ];

  for (const field of forbiddenFields) {
    assert.equal(
      types.includes(field),
      false,
      `types.ts should not include ${field}`
    );
  }
});

