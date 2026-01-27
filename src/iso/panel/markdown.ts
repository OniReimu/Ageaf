import MarkdownIt from 'markdown-it';
import Prism from 'prismjs';

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

// Custom fence renderer with syntax highlighting
renderer.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const content = token.content;
  const info = token.info ? token.info.trim() : '';

  // Extract language from info string (e.g., "python {highlight: [1,2]}" -> "python")
  const langMatch = info.match(/^(\S+)/);
  const rawLang = langMatch ? langMatch[1] : '';
  const lang = rawLang ? normalizeLanguage(rawLang) : '';

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

function normalizeTaskLists(content: string) {
  const unchecked = content.replace(/^(\s*[-*]\s+)\[ \]\s+/gm, '$1☐ ');
  return unchecked.replace(/^(\s*[-*]\s+)\[(x|X)\]\s+/gm, '$1☑ ');
}

export function renderMarkdown(content: string) {
  return renderer.render(normalizeTaskLists(content));
}

export function parseMarkdown(content: string) {
  return renderer.parse(normalizeTaskLists(content), {});
}
