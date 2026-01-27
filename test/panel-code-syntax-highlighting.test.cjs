const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Code blocks have syntax highlighting and language labels', () => {
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const markdownPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'markdown.ts');
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');

  const panelContents = fs.readFileSync(panelPath, 'utf8');
  const markdownContents = fs.readFileSync(markdownPath, 'utf8');
  const cssContents = fs.readFileSync(cssPath, 'utf8');

  // Check Prism.js is imported
  assert.match(markdownContents, /import Prism from ['"]prismjs['"]/);

  // Check language grammars are imported
  assert.match(markdownContents, /import ['"]prismjs\/components\/prism-javascript['"]/);
  assert.match(markdownContents, /import ['"]prismjs\/components\/prism-typescript['"]/);
  assert.match(markdownContents, /import ['"]prismjs\/components\/prism-python['"]/);

  // Check custom fence renderer is implemented
  assert.match(markdownContents, /renderer\.renderer\.rules\.fence/);
  assert.match(markdownContents, /data-language/);
  assert.match(markdownContents, /data-language-label/);

  // Check language detection and normalization
  assert.match(markdownContents, /normalizeLanguage/);
  assert.match(markdownContents, /getLanguageDisplayName/);

  // Check Prism.highlight is called
  assert.match(markdownContents, /Prism\.highlight/);

  // Check QuoteData type includes language fields
  assert.match(panelContents, /type QuoteData = \{/);
  assert.match(panelContents, /language\?:/);
  assert.match(panelContents, /languageLabel\?:/);

  // Check language label is rendered
  assert.match(panelContents, /ageaf-message__quote-lang/);
  assert.match(panelContents, /quote\.languageLabel/);

  // Check CSS for language label exists
  assert.match(cssContents, /\.ageaf-message__quote-lang/);
  assert.match(cssContents, /position:\s*absolute/);
  assert.match(cssContents, /text-transform:\s*uppercase/);

  // Check Prism syntax highlighting styles exist
  assert.match(cssContents, /\.ageaf-code-block/);
  assert.match(cssContents, /\.token\.comment/);
  assert.match(cssContents, /\.token\.keyword/);
  assert.match(cssContents, /\.token\.string/);
  assert.match(cssContents, /\.token\.function/);

  // Check code block preserves wrapping
  assert.match(cssContents, /white-space:\s*pre-wrap/);
  assert.match(cssContents, /word-wrap:\s*break-word/);
});
