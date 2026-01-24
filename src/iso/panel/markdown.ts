import MarkdownIt from 'markdown-it';

const renderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

function normalizeTaskLists(content: string) {
  const unchecked = content.replace(/^(\s*[-*]\s+)\[ \]\s+/gm, '$1☐ ');
  return unchecked.replace(/^(\s*[-*]\s+)\[(x|X)\]\s+/gm, '$1☑ ');
}

export function renderMarkdown(content: string) {
  return renderer.render(normalizeTaskLists(content));
}

