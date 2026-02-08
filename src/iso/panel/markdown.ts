import MarkdownIt from 'markdown-it';
import Prism from 'prismjs';
import katex from 'katex';

// Import commonly used language grammars
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-latex';
import 'prismjs/components/prism-diff';

const renderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

// Language alias mappings for common variations
const languageAliases: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'sh': 'bash',
  'shell': 'bash',
  'yml': 'yaml',
  'tex': 'latex',
  // Allow forcing raw LaTeX code blocks while still getting LaTeX highlighting.
  // The fence renderer checks the *raw* info string for `latex-raw` to disable KaTeX.
  'latex-raw': 'latex',
  'tex-raw': 'latex',
  'cs': 'csharp',
  'c++': 'cpp',
};

// Get normalized language name
function normalizeLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim();
  return languageAliases[normalized] || normalized;
}

// Get display name for language label
function getLanguageDisplayName(lang: string): string {
  const displayNames: Record<string, string> = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'jsx': 'JSX',
    'tsx': 'TSX',
    'python': 'Python',
    'java': 'Java',
    'cpp': 'C++',
    'csharp': 'C#',
    'go': 'Go',
    'rust': 'Rust',
    'bash': 'Bash',
    'json': 'JSON',
    'yaml': 'YAML',
    'markdown': 'Markdown',
    'sql': 'SQL',
    'css': 'CSS',
    'scss': 'SCSS',
    'latex': 'LaTeX',
    'diff': 'Diff',
    'mermaid': 'Mermaid',
  };
  return displayNames[lang] || lang.charAt(0).toUpperCase() + lang.slice(1);
}

// Escape HTML for safe rendering
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render LaTeX math using KaTeX
function renderLatex(latex: string, displayMode: boolean): string {
  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: false,
    });
    // Wrap in a span with data attribute containing raw LaTeX for copy behavior
    const mode = displayMode ? 'display' : 'inline';
    // For display math, include a small "copy source" button inline after the equation.
    const copyButton = displayMode
      ? `<button class="ageaf-latex__copy" type="button" data-latex-copy="true" aria-label="Copy LaTeX" title="Copy LaTeX">⧉</button>`
      : '';
    return `<span class="ageaf-latex ageaf-latex--${mode}" data-latex="${escapeHtml(
      latex
    )}">${html}${copyButton}</span>`;
  } catch (e) {
    // If rendering fails, return escaped LaTeX
    return `<code class="ageaf-latex-error">${escapeHtml(latex)}</code>`;
  }
}

// Check if LaTeX content is actually math (equations/notations) vs other LaTeX commands
function looksLikeMath(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return false;

  // Treat full LaTeX documents / non-math artifacts as NOT math (keep as raw code fence).
  const lowerSource = trimmed.toLowerCase();
  if (
    lowerSource.includes('\\documentclass') ||
    lowerSource.includes('\\begin{document}') ||
    lowerSource.includes('\\end{document}') ||
    lowerSource.includes('\\usepackage') ||
    lowerSource.includes('\\begin{tikzpicture}') ||
    lowerSource.includes('\\newcommand') ||
    lowerSource.includes('\\def')
  ) {
    return false;
  }

  // Common non-math LaTeX "prose/layout" commands: keep raw unless explicitly requested.
  if (
    lowerSource.includes('\\section') ||
    lowerSource.includes('\\subsection') ||
    lowerSource.includes('\\subsubsection') ||
    lowerSource.includes('\\paragraph') ||
    lowerSource.includes('\\chapter') ||
    lowerSource.includes('\\heading') ||
    lowerSource.includes('\\begin{itemize}') ||
    lowerSource.includes('\\begin{enumerate}') ||
    lowerSource.includes('\\item') ||
    lowerSource.includes('\\begin{figure}') ||
    lowerSource.includes('\\includegraphics') ||
    lowerSource.includes('\\caption')
  ) {
    return false;
  }

  // If a would-be math block contains `$`, it's usually prose that incorrectly nests inline math
  // inside display math (e.g. `\[ Let $x$ ... \]`). KaTeX will choke on this; keep it raw.
  if (trimmed.includes('$')) {
    return false;
  }

  // Math environments
  const mathEnvs = [
    '\\begin{equation}',
    '\\begin{equation*}',
    '\\begin{align}',
    '\\begin{align*}',
    '\\begin{aligned}',
    '\\begin{eqnarray}',
    '\\begin{eqnarray*}',
    '\\begin{gather}',
    '\\begin{gather*}',
    '\\begin{multline}',
    '\\begin{multline*}',
    '\\begin{cases}',
    '\\begin{matrix}',
    '\\begin{pmatrix}',
    '\\begin{bmatrix}',
    '\\begin{vmatrix}',
    '\\begin{Vmatrix}',
  ];

  for (const env of mathEnvs) {
    if (lowerSource.includes(env)) return true;
  }

  // Starting with delimiters alone is not enough; require some actual math signal.
  const withoutDelims = stripOuterMathDelimiters(trimmed);
  const lowerNoDelims = withoutDelims.toLowerCase();

  // Common math commands that indicate math content
  const mathCommands = [
    '\\frac',
    '\\sqrt',
    '\\sum',
    '\\prod',
    '\\int',
    '\\lim',
    '\\sin',
    '\\cos',
    '\\tan',
    '\\log',
    '\\ln',
    '\\exp',
    '\\max',
    '\\min',
    '\\sup',
    '\\inf',
    '\\mathbb',
    '\\mathcal',
    '\\mathbf',
    '\\mathit',
    '\\mathrm',
    '\\text',
    '\\left',
    '\\right',
    '\\big',
    '\\Big',
    '\\bigg',
    '\\Bigg',
    '\\lceil',
    '\\rceil',
    '\\lfloor',
    '\\rfloor',
    '\\langle',
    '\\rangle',
    '\\approx',
    '\\equiv',
    '\\leq',
    '\\geq',
    '\\neq',
    '\\sim',
    '\\simeq',
    '\\cong',
  ];

  // If it contains several math commands, it's likely math
  let mathCommandCount = 0;
  for (const cmd of mathCommands) {
    if (lowerNoDelims.includes(cmd)) {
      mathCommandCount++;
      if (mathCommandCount >= 2) return true; // At least 2 math commands = likely math
    }
  }

  // Strong symbol signals for math blocks
  if (
    /[=_^]/.test(withoutDelims) ||
    lowerNoDelims.includes('\\cdot') ||
    lowerNoDelims.includes('\\times') ||
    lowerNoDelims.includes('\\to') ||
    lowerNoDelims.includes('\\mapsto')
  ) {
    if (mathCommandCount >= 1) return true;
    // Even without commands, a short expression with symbols is likely math.
    if (withoutDelims.length <= 140) return true;
  }

  // If it's short and contains at least one math command, likely math.
  if (withoutDelims.length < 120 && mathCommandCount >= 1) return true;

  // Otherwise, assume it's NOT math (keep as raw code)
  return false;
}

function stripOuterMathDelimiters(source: string): string {
  let s = source.trim();
  if (!s) return s;

  // \[ ... \]
  if (s.startsWith('\\[') && s.endsWith('\\]')) {
    return s.slice(2, -2).trim();
  }

  // \( ... \)
  if (s.startsWith('\\(') && s.endsWith('\\)')) {
    return s.slice(2, -2).trim();
  }

  // $$ ... $$
  if (s.startsWith('$$') && s.endsWith('$$')) {
    return s.slice(2, -2).trim();
  }

  // $ ... $
  if (s.startsWith('$') && s.endsWith('$') && s.length > 1) {
    return s.slice(1, -1).trim();
  }

  return s;
}

// Open all links in a new tab so they don't replace the Overleaf page
renderer.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, idx, options);
};

// Custom fence renderer with syntax highlighting
renderer.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const content = token.content;
  const info = token.info ? token.info.trim() : '';

  // Extract language from info string (e.g., "python {highlight: [1,2]}" -> "python")
  const langMatch = info.match(/^(\S+)/);
  const rawLang = langMatch ? langMatch[1] : '';
  const lang = rawLang ? normalizeLanguage(rawLang) : '';

  // Only render fenced ```latex blocks as KaTeX if they contain math equations/notations.
  // Other LaTeX (document structure, commands, etc.) stays as raw code.
  // Users can force raw LaTeX by using ```text or ```latex-raw.
  if (lang === 'latex' && rawLang.toLowerCase() !== 'latex-raw') {
    const latex = content.trim();
    if (latex && looksLikeMath(latex)) {
      // Fenced blocks often include outer delimiters like \[...\] — strip them before KaTeX.
      const normalized = stripOuterMathDelimiters(latex);
      const rendered = renderLatex(normalized, true);
      // IMPORTANT: Do NOT use <pre> here — Panel extracts <pre> into the "quote" UI.
      // Render as a normal block so math stays in the main message flow.
      return `<div class="ageaf-latex-fence" data-latex="${escapeHtml(normalized)}">${rendered}</div>\n`;
    }
    // If it's LaTeX but not math, fall through to render as raw code block
  }

  // Rendered diagram output from the MCP render_mermaid tool.
  // The SVG is from a trusted source (beautiful-mermaid), so we render it inline.
  // IMPORTANT: Do NOT use <pre> here — Panel extracts <pre> into the "quote" UI.
  if (rawLang.toLowerCase() === 'ageaf-diagram') {
    const svg = content.trim();
    if (svg.startsWith('<svg')) {
      // Strip <script> tags and event handlers as a safety measure
      const sanitized = svg
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
      const downloadBtn =
        `<button class="ageaf-diagram__download" type="button" data-diagram-download="true" aria-label="Download SVG" title="Download SVG">` +
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>` +
        `</svg> Download SVG</button>`;
      return `<div class="ageaf-diagram"><div class="ageaf-diagram__svg">${sanitized}</div><div class="ageaf-diagram__actions">${downloadBtn}</div></div>\n`;
    }
    // If it doesn't look like SVG, fall through to render as a code block
  }

  let highlightedCode = escapeHtml(content);
  let prismLang = lang;

  // Try to highlight if language is supported
  if (lang && Prism.languages[lang]) {
    try {
      highlightedCode = Prism.highlight(content, Prism.languages[lang], lang);
      prismLang = lang;
    } catch (e) {
      // Fallback to escaped HTML if highlighting fails
      highlightedCode = escapeHtml(content);
    }
  } else if (lang) {
    // Language specified but not supported - still escape
    highlightedCode = escapeHtml(content);
  }

  // Get display name for label
  const displayName = lang ? getLanguageDisplayName(lang) : 'text';

  // Return HTML with language label and highlighted code
  return `<pre class="ageaf-code-block" data-language="${escapeHtml(lang)}" data-language-label="${escapeHtml(displayName)}"><code class="language-${escapeHtml(prismLang)}">${highlightedCode}</code></pre>\n`;
};

// Add inline LaTeX rule for \(...\) and $...$
function latexInline(state: any, silent: boolean) {
  const start = state.pos;
  const max = state.posMax;

  // Check for \( or $
  let isBackslash = false;
  if (state.src.charCodeAt(start) === 0x5C /* \ */ && state.src.charCodeAt(start + 1) === 0x28 /* ( */) {
    isBackslash = true;
  } else if (state.src.charCodeAt(start) === 0x24 /* $ */) {
    isBackslash = false;
  } else {
    return false;
  }

  // Look for closing delimiter
  const openLen = isBackslash ? 2 : 1;
  const closePattern = isBackslash ? '\\)' : '$';
  const closeLen = isBackslash ? 2 : 1;

  let pos = start + openLen;
  while (pos < max) {
    if (isBackslash) {
      if (state.src.charCodeAt(pos) === 0x5C && state.src.charCodeAt(pos + 1) === 0x29) {
        break;
      }
    } else {
      if (state.src.charCodeAt(pos) === 0x24) {
        break;
      }
    }
    pos++;
  }

  if (pos >= max) {
    return false; // No closing delimiter found
  }

  if (!silent) {
    const latex = state.src.slice(start + openLen, pos);
    const token = state.push('latex_inline', '', 0);
    token.content = latex;
  }

  state.pos = pos + closeLen;
  return true;
}

// Add block LaTeX rule for \[...\] and $$...$$
function latexBlock(state: any, startLine: number, endLine: number, silent: boolean) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];

  // Check for \[ or $$
  let isBackslash = false;
  if (state.src.charCodeAt(pos) === 0x5C /* \ */ && state.src.charCodeAt(pos + 1) === 0x5B /* [ */) {
    isBackslash = true;
  } else if (state.src.charCodeAt(pos) === 0x24 /* $ */ && state.src.charCodeAt(pos + 1) === 0x24) {
    isBackslash = false;
  } else {
    return false;
  }

  const openLen = 2;
  pos += openLen;

  // Find closing delimiter
  const closePattern = isBackslash ? '\\]' : '$$';
  let nextLine = startLine;
  let found = false;

  while (nextLine < endLine) {
    nextLine++;
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];

    const line = state.src.slice(pos, max);
    if (line.includes(closePattern)) {
      found = true;
      break;
    }
  }

  if (!found) {
    return false;
  }

  if (!silent) {
    const oldLineMax = state.lineMax;
    state.lineMax = nextLine;

    const startPos = state.bMarks[startLine] + state.tShift[startLine] + openLen;
    // Find the actual position of the closing delimiter
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
    const lineEnd = state.eMarks[nextLine];
    const lineContent = state.src.slice(lineStart, lineEnd);
    const closeIndex = lineContent.indexOf(closePattern);
    
    if (closeIndex === -1) {
      state.lineMax = oldLineMax;
      return false;
    }

    const endPos = lineStart + closeIndex;
    const latex = state.src.slice(startPos, endPos);

    // Only treat \[...\] / $$...$$ as math if the contents look like math.
    // Otherwise, leave it as raw text (user likely wants LaTeX source shown).
    if (!looksLikeMath(latex)) {
      state.lineMax = oldLineMax;
      return false;
    }

    const token = state.push('latex_block', '', 0);
    token.content = latex;
    token.map = [startLine, nextLine + 1];

    state.lineMax = oldLineMax;
  }

  state.line = nextLine + 1;
  return true;
}

// Add rendering rules
renderer.renderer.rules.latex_inline = (tokens, idx) => {
  return renderLatex(tokens[idx].content, false);
};

renderer.renderer.rules.latex_block = (tokens, idx) => {
  return renderLatex(tokens[idx].content, true);
};

// Register the rules
renderer.inline.ruler.before('escape', 'latex_inline', latexInline);
renderer.block.ruler.before('fence', 'latex_block', latexBlock);

function normalizeTaskLists(content: string) {
  const unchecked = content.replace(/^(\s*[-*]\s+)\[ \]\s+/gm, '$1☐ ');
  return unchecked.replace(/^(\s*[-*]\s+)\[(x|X)\]\s+/gm, '$1☑ ');
}

function extractPatchText(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  try {
    const parsed = JSON.parse(trimmed) as { kind?: unknown; text?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const kind = parsed.kind;
    if (
      kind !== 'replaceSelection' &&
      kind !== 'insertAtCursor' &&
      kind !== 'replaceRangeInFile'
    ) {
      return null;
    }
    if (typeof parsed.text !== 'string') return null;
    return parsed.text;
  } catch {
    return null;
  }
}

function normalizeAssistantOutput(content: string) {
  let next = content;

  next = next.replace(/```\s*done\.?[^\n]*\n([\s\S]*?)```/gi, '$1');

  next = next.replace(/```(?:ageaf[-_]?patch)[^\n]*\n[\s\S]*?```/gi, '');

  // Strip diagram-loading placeholder when followed by the complete fence
  next = next.replace(/\n?\*Rendering diagram\u2026\*\n(?=```ageaf-diagram)/g, '');

  next = next.replace(/```(?:json)?\s*\n([\s\S]*?)```/gi, (match, body) => {
    const patchText = extractPatchText(body);
    return patchText ?? match;
  });

  const inlinePatchText = extractPatchText(next);
  if (inlinePatchText) return inlinePatchText;

  return next;
}

export function renderMarkdown(content: string) {
  return renderer.render(normalizeTaskLists(normalizeAssistantOutput(content)));
}

export function parseMarkdown(content: string) {
  return renderer.parse(normalizeTaskLists(normalizeAssistantOutput(content)), {});
}
