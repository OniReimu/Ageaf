const assert = require('node:assert/strict');
const test = require('node:test');

/**
 * Tests for the LaTeX \input{} / \include{} / \bibliography{} expansion logic.
 *
 * Because the source is TypeScript (latexExpand.ts), we re-implement the pure
 * functions inline here for testing.  The real module is tested indirectly via
 * build + integration, but these unit tests cover the core resolution and
 * expansion logic.
 */

// ---------------------------------------------------------------------------
// Re-implementation of pure helpers from src/iso/panel/latexExpand.ts
// ---------------------------------------------------------------------------

const fileExt = (name) => {
  const m = name.match(/\.[a-z0-9]+$/i);
  return m ? m[0].toLowerCase() : '';
};

const resolveLatexRef = (inputRef, directive, contextDir, projectFiles) => {
  const ref = inputRef.replace(/^\.\//, '');
  const hasExt = /\.(tex|bib|sty|cls|bst|bbl|dtx|ins|tikz)$/i.test(ref);
  const isBib = directive === 'bibliography' || directive === 'addbibresource';
  const extSuffix = isBib ? '.bib' : '.tex';
  const candidates = hasExt ? [ref] : [ref, `${ref}${extSuffix}`];
  const relCandidates = contextDir
    ? candidates.map((c) => `${contextDir}/${c}`)
    : [];
  const allCandidates = [...relCandidates, ...candidates];
  const exact = projectFiles.find((f) =>
    allCandidates.some((c) => f.path === c)
  );
  if (exact) return exact.path;
  const lower = allCandidates.map((c) => c.toLowerCase());
  const ci = projectFiles.find((f) =>
    lower.some((c) => f.path.toLowerCase() === c)
  );
  if (ci) return ci.path;
  const basename = ref.split('/').pop() ?? ref;
  const baseCandidates = hasExt
    ? [basename.toLowerCase()]
    : [basename.toLowerCase(), `${basename.toLowerCase()}${extSuffix}`];
  const byName = projectFiles.find((f) =>
    baseCandidates.some((c) => f.name.toLowerCase() === c)
  );
  if (byName) return byName.path;
  return null;
};

const LATEX_EXPAND_MAX_DEPTH = 8;
const LATEX_EXPAND_MAX_FILES = 50;

const expandLatexIncludes = async (
  texContent,
  fetchFile,
  projectFiles,
  currentFilePath,
  ancestorStack = new Set(),
  inlinedFiles = new Set(),
  depth = 0
) => {
  if (depth >= LATEX_EXPAND_MAX_DEPTH) return texContent;
  const contextDir = currentFilePath.includes('/')
    ? currentFilePath.slice(0, currentFilePath.lastIndexOf('/'))
    : '';
  const directiveRe =
    /\\(input|include|bibliography|addbibresource)\s*\{([^}]+)\}/g;
  const lines = texContent.split('\n');
  const expanded = [];
  for (const line of lines) {
    if (line.trimStart().startsWith('%')) {
      expanded.push(line);
      continue;
    }
    const commentIdx = line.indexOf('%');
    const nonComment = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const commentSuffix = commentIdx >= 0 ? line.slice(commentIdx) : '';
    if (!directiveRe.test(nonComment)) {
      expanded.push(line);
      directiveRe.lastIndex = 0;
      continue;
    }
    directiveRe.lastIndex = 0;
    let result = '';
    let lastIdx = 0;
    let m;
    while ((m = directiveRe.exec(nonComment)) !== null) {
      const directive = m[1];
      const rawArg = m[2].trim();
      const refList =
        directive === 'bibliography'
          ? rawArg.split(',').map((s) => s.trim())
          : [rawArg];
      result += nonComment.slice(lastIdx, m.index);
      let replacement = '';
      for (const inputRef of refList) {
        if (inlinedFiles.size >= LATEX_EXPAND_MAX_FILES) {
          replacement += m[0];
          continue;
        }
        const resolved = resolveLatexRef(
          inputRef,
          directive,
          contextDir,
          projectFiles
        );
        if (!resolved || ancestorStack.has(resolved)) {
          replacement += m[0];
          continue;
        }
        const content = await fetchFile(resolved);
        if (content == null) {
          replacement += m[0];
          continue;
        }
        inlinedFiles.add(resolved);
        const isTex = fileExt(resolved) === '.tex';
        let body;
        if (isTex) {
          ancestorStack.add(resolved);
          body = await expandLatexIncludes(
            content,
            fetchFile,
            projectFiles,
            resolved,
            ancestorStack,
            inlinedFiles,
            depth + 1
          );
          ancestorStack.delete(resolved);
        } else {
          body = content;
        }
        replacement +=
          `\n%%% --- begin included file: ${resolved} ---\n` +
          body +
          `\n%%% --- end included file: ${resolved} ---\n`;
      }
      result += replacement;
      lastIdx = m.index + m[0].length;
    }
    result += nonComment.slice(lastIdx) + commentSuffix;
    expanded.push(result);
  }
  return expanded.join('\n');
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PROJECT_FILES = [
  { path: 'main.tex', name: 'main.tex' },
  { path: 'subsections/1.Introduction.tex', name: '1.Introduction.tex' },
  { path: 'subsections/2.RelatedWork.tex', name: '2.RelatedWork.tex' },
  { path: 'subsections/3.Method.tex', name: '3.Method.tex' },
  { path: 'subsections/nested/deep.tex', name: 'deep.tex' },
  { path: 'bib.bib', name: 'bib.bib' },
  { path: 'refs.bib', name: 'refs.bib' },
];

const FILE_CONTENTS = {
  'subsections/1.Introduction.tex':
    '\\section{Introduction}\nThis is the introduction.',
  'subsections/2.RelatedWork.tex':
    '\\section{Related Work}\nPrior work includes ...',
  'subsections/3.Method.tex':
    '\\section{Method}\n\\input{nested/deep}\nThe method is ...',
  'subsections/nested/deep.tex': 'Deep nested content here.',
  'bib.bib': '@article{foo, title={Foo}}',
  'refs.bib': '@article{bar, title={Bar}}',
};

const mockFetch = async (path) => FILE_CONTENTS[path] ?? null;

// ---------------------------------------------------------------------------
// Tests: resolveLatexRef
// ---------------------------------------------------------------------------

test('resolveLatexRef: resolves input without extension', () => {
  const result = resolveLatexRef(
    'subsections/1.Introduction',
    'input',
    '',
    PROJECT_FILES
  );
  assert.equal(result, 'subsections/1.Introduction.tex');
});

test('resolveLatexRef: resolves input with extension', () => {
  const result = resolveLatexRef(
    'subsections/1.Introduction.tex',
    'input',
    '',
    PROJECT_FILES
  );
  assert.equal(result, 'subsections/1.Introduction.tex');
});

test('resolveLatexRef: bibliography resolves to .bib not .tex', () => {
  const result = resolveLatexRef('bib', 'bibliography', '', PROJECT_FILES);
  assert.equal(result, 'bib.bib');
});

test('resolveLatexRef: addbibresource resolves to .bib', () => {
  const result = resolveLatexRef('refs', 'addbibresource', '', PROJECT_FILES);
  assert.equal(result, 'refs.bib');
});

test('resolveLatexRef: input does NOT resolve to .bib', () => {
  // "bib" without extension + input directive should not match bib.bib
  const files = [{ path: 'bib.bib', name: 'bib.bib' }];
  const result = resolveLatexRef('bib', 'input', '', files);
  assert.equal(result, null);
});

test('resolveLatexRef: strips leading ./', () => {
  const result = resolveLatexRef(
    './subsections/1.Introduction',
    'input',
    '',
    PROJECT_FILES
  );
  assert.equal(result, 'subsections/1.Introduction.tex');
});

test('resolveLatexRef: relative to contextDir', () => {
  // From within subsections/, "nested/deep" → "subsections/nested/deep.tex"
  const result = resolveLatexRef(
    'nested/deep',
    'input',
    'subsections',
    PROJECT_FILES
  );
  assert.equal(result, 'subsections/nested/deep.tex');
});

test('resolveLatexRef: case-insensitive match', () => {
  const files = [{ path: 'Sections/Intro.tex', name: 'Intro.tex' }];
  const result = resolveLatexRef('sections/intro', 'input', '', files);
  assert.equal(result, 'Sections/Intro.tex');
});

test('resolveLatexRef: basename fallback', () => {
  const result = resolveLatexRef('deep', 'input', '', PROJECT_FILES);
  assert.equal(result, 'subsections/nested/deep.tex');
});

test('resolveLatexRef: returns null for missing file', () => {
  const result = resolveLatexRef('nonexistent', 'input', '', PROJECT_FILES);
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Tests: expandLatexIncludes
// ---------------------------------------------------------------------------

test('expandLatexIncludes: expands basic \\input{}', async () => {
  const tex = '\\documentclass{article}\n\\input{subsections/1.Introduction}\n\\end{document}';
  const result = await expandLatexIncludes(tex, mockFetch, PROJECT_FILES, 'main.tex');

  assert.ok(result.includes('\\section{Introduction}'));
  assert.ok(result.includes('This is the introduction.'));
  assert.ok(result.includes('%%% --- begin included file: subsections/1.Introduction.tex ---'));
  assert.ok(result.includes('%%% --- end included file: subsections/1.Introduction.tex ---'));
  // Preamble and postamble preserved
  assert.ok(result.includes('\\documentclass{article}'));
  assert.ok(result.includes('\\end{document}'));
});

test('expandLatexIncludes: expands multiple \\input{} directives', async () => {
  const tex = [
    '\\input{subsections/1.Introduction}',
    '\\input{subsections/2.RelatedWork}',
  ].join('\n');
  const result = await expandLatexIncludes(tex, mockFetch, PROJECT_FILES, 'main.tex');

  assert.ok(result.includes('This is the introduction.'));
  assert.ok(result.includes('Prior work includes ...'));
});

test('expandLatexIncludes: expands \\bibliography{}', async () => {
  const tex = '\\bibliography{bib}';
  const result = await expandLatexIncludes(tex, mockFetch, PROJECT_FILES, 'main.tex');

  assert.ok(result.includes('@article{foo, title={Foo}}'));
  assert.ok(result.includes('%%% --- begin included file: bib.bib ---'));
});

test('expandLatexIncludes: expands \\bibliography{a,b} with multiple entries', async () => {
  const tex = '\\bibliography{bib,refs}';
  const result = await expandLatexIncludes(tex, mockFetch, PROJECT_FILES, 'main.tex');

  assert.ok(result.includes('@article{foo, title={Foo}}'));
  assert.ok(result.includes('@article{bar, title={Bar}}'));
});

test('expandLatexIncludes: skips commented-out directives', async () => {
  const tex = '% \\input{subsections/1.Introduction}\nReal content here.';
  const result = await expandLatexIncludes(tex, mockFetch, PROJECT_FILES, 'main.tex');

  assert.ok(!result.includes('This is the introduction.'));
  assert.ok(result.includes('% \\input{subsections/1.Introduction}'));
  assert.ok(result.includes('Real content here.'));
});

test('expandLatexIncludes: preserves inline comment after directive', async () => {
  const tex = '\\input{subsections/1.Introduction} % load intro';
  const result = await expandLatexIncludes(tex, mockFetch, PROJECT_FILES, 'main.tex');

  assert.ok(result.includes('This is the introduction.'));
  assert.ok(result.includes('% load intro'));
});

test('expandLatexIncludes: preserves prefix text on same line', async () => {
  const tex = 'Some prefix \\input{subsections/1.Introduction} suffix';
  const result = await expandLatexIncludes(tex, mockFetch, PROJECT_FILES, 'main.tex');

  assert.ok(result.includes('Some prefix'));
  assert.ok(result.includes('This is the introduction.'));
  assert.ok(result.includes(' suffix'));
});

test('expandLatexIncludes: recursively expands nested includes', async () => {
  // 3.Method.tex contains \input{nested/deep}
  const tex = '\\input{subsections/3.Method}';
  const result = await expandLatexIncludes(tex, mockFetch, PROJECT_FILES, 'main.tex');

  assert.ok(result.includes('\\section{Method}'));
  assert.ok(result.includes('Deep nested content here.'));
  assert.ok(result.includes('%%% --- begin included file: subsections/nested/deep.tex ---'));
});

test('expandLatexIncludes: detects cycles and leaves directive as-is', async () => {
  // Create a circular reference: a.tex includes b.tex includes a.tex
  const circularFiles = [
    { path: 'a.tex', name: 'a.tex' },
    { path: 'b.tex', name: 'b.tex' },
  ];
  const circularContents = {
    'a.tex': 'A content\n\\input{b}',
    'b.tex': 'B content\n\\input{a}',
  };
  const circularFetch = async (p) => circularContents[p] ?? null;

  const result = await expandLatexIncludes(
    'Start\n\\input{a}',
    circularFetch,
    circularFiles,
    'main.tex'
  );

  // a.tex is expanded, b.tex is expanded, but the second \\input{a} is left as-is
  assert.ok(result.includes('A content'));
  assert.ok(result.includes('B content'));
  // The cycle reference should remain as a raw directive
  assert.ok(result.includes('\\input{a}'));
});

test('expandLatexIncludes: leaves unresolvable \\input{} as-is', async () => {
  const tex = '\\input{nonexistent/file}';
  const result = await expandLatexIncludes(tex, mockFetch, PROJECT_FILES, 'main.tex');

  assert.equal(result, '\\input{nonexistent/file}');
});

test('expandLatexIncludes: leaves directive as-is on fetch failure', async () => {
  const failFetch = async () => null;
  const tex = '\\input{subsections/1.Introduction}';
  const result = await expandLatexIncludes(tex, failFetch, PROJECT_FILES, 'main.tex');

  assert.equal(result, '\\input{subsections/1.Introduction}');
});

test('expandLatexIncludes: respects max depth limit', async () => {
  // Create a deeply nested chain
  const deepFiles = [];
  const deepContents = {};
  for (let i = 0; i < 15; i++) {
    const name = `level${i}.tex`;
    deepFiles.push({ path: name, name });
    deepContents[name] = i < 14 ? `Level ${i}\n\\input{level${i + 1}}` : `Level ${i} end`;
  }
  const deepFetch = async (p) => deepContents[p] ?? null;

  const result = await expandLatexIncludes(
    '\\input{level0}',
    deepFetch,
    deepFiles,
    'main.tex'
  );

  // First 8 levels should be expanded (depth 0-7)
  assert.ok(result.includes('Level 0'));
  assert.ok(result.includes('Level 7'));
  // Level 8+ should remain as raw directives (depth limit reached)
  assert.ok(result.includes('\\input{level8}'));
});

test('expandLatexIncludes: respects max files limit', async () => {
  // Create more files than the limit
  const manyFiles = [];
  const manyContents = {};
  for (let i = 0; i < 60; i++) {
    const name = `file${i}.tex`;
    manyFiles.push({ path: name, name });
    manyContents[name] = `Content of file ${i}`;
  }
  const manyFetch = async (p) => manyContents[p] ?? null;

  const lines = [];
  for (let i = 0; i < 60; i++) {
    lines.push(`\\input{file${i}}`);
  }
  const tex = lines.join('\n');

  const result = await expandLatexIncludes(tex, manyFetch, manyFiles, 'main.tex');

  // First 50 should be expanded
  assert.ok(result.includes('Content of file 0'));
  assert.ok(result.includes('Content of file 49'));
  // Files beyond limit should remain as raw directives
  assert.ok(result.includes('\\input{file50}'));
});

test('expandLatexIncludes: full document simulation', async () => {
  const mainTex = [
    '\\documentclass[conference]{IEEEtran}',
    '\\usepackage{amsmath}',
    '\\begin{document}',
    '\\title{My Paper}',
    '\\maketitle',
    '\\input{subsections/1.Introduction}',
    '\\input{subsections/2.RelatedWork}',
    '\\input{subsections/3.Method}',
    '\\bibliography{bib}',
    '\\end{document}',
  ].join('\n');

  const result = await expandLatexIncludes(mainTex, mockFetch, PROJECT_FILES, 'main.tex');

  // All sections present
  assert.ok(result.includes('\\section{Introduction}'));
  assert.ok(result.includes('\\section{Related Work}'));
  assert.ok(result.includes('\\section{Method}'));
  // Nested content expanded
  assert.ok(result.includes('Deep nested content here.'));
  // Bibliography expanded
  assert.ok(result.includes('@article{foo, title={Foo}}'));
  // Document structure preserved
  assert.ok(result.includes('\\documentclass[conference]{IEEEtran}'));
  assert.ok(result.includes('\\end{document}'));
  // No raw \input{} directives remain (except the nested one was resolved)
  assert.ok(!result.includes('\\input{subsections/1.Introduction}'));
  assert.ok(!result.includes('\\input{subsections/2.RelatedWork}'));
  assert.ok(!result.includes('\\input{subsections/3.Method}'));
  assert.ok(!result.includes('\\bibliography{bib}'));
});
