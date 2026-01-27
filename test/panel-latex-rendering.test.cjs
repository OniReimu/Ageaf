const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('LaTeX rendering is implemented with KaTeX', () => {
  const markdownPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'markdown.ts');
  const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const cssPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'panel.css');

  const markdownContents = fs.readFileSync(markdownPath, 'utf8');
  const panelContents = fs.readFileSync(panelPath, 'utf8');
  const cssContents = fs.readFileSync(cssPath, 'utf8');

  // Check KaTeX is imported
  assert.match(markdownContents, /import katex from ['"]katex['"]/);

  // Check LaTeX rendering function exists
  assert.match(markdownContents, /function renderLatex/);
  assert.match(markdownContents, /katex\.renderToString/);

  // Check LaTeX delimiters are handled (inline and display)
  assert.match(markdownContents, /data-latex/);
  assert.match(markdownContents, /ageaf-latex/);
  assert.match(markdownContents, /displayMode \? ['"]display['"] : ['"]inline['"]/);
  assert.match(markdownContents, /ageaf-latex--\$\{mode\}/);

  // Check inline and block LaTeX rules are registered
  assert.match(markdownContents, /function latexInline/);
  assert.match(markdownContents, /function latexBlock/);
  assert.match(markdownContents, /renderer\.inline\.ruler/);
  assert.match(markdownContents, /renderer\.block\.ruler/);

  // Check LaTeX rendering rules exist
  assert.match(markdownContents, /renderer\.renderer\.rules\.latex_inline/);
  assert.match(markdownContents, /renderer\.renderer\.rules\.latex_block/);

  // Check KaTeX CSS is imported
  assert.match(panelContents, /import ['"]katex\/dist\/katex\.min\.css['"]/);

  // Check copy-to-source behavior is implemented
  assert.match(panelContents, /extractCopyTextFromQuoteHtml/);
  assert.match(panelContents, /getAttribute\(['"]data-latex['"]\)/);
  assert.match(panelContents, /ageaf-latex/);

  // Check LaTeX CSS styles exist
  assert.match(cssContents, /\.ageaf-latex/);
  assert.match(cssContents, /\.ageaf-latex--inline/);
  assert.match(cssContents, /\.ageaf-latex--display/);
  assert.match(cssContents, /\.ageaf-latex-error/);

  // Check display LaTeX can overflow/scroll
  assert.match(cssContents, /\.ageaf-latex--display[\s\S]*?overflow-x:\s*auto/);
});
