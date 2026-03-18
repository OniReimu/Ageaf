import assert from 'node:assert/strict';
import test from 'node:test';
import { extractToolDisplayInfo, normalizeToolInput, MAX_TOOL_DISPLAY_LEN } from '../src/toolDisplayInfo.js';

test('Read tool extracts file_path', () => {
  const result = extractToolDisplayInfo('Read', { file_path: '/foo/bar.ts' });
  assert.deepEqual(result, { input: '/foo/bar.ts' });
});

test('Write tool extracts file_path', () => {
  const result = extractToolDisplayInfo('Write', { file_path: '/src/index.ts' });
  assert.deepEqual(result, { input: '/src/index.ts' });
});

test('Edit tool extracts file_path', () => {
  const result = extractToolDisplayInfo('Edit', { file_path: '/src/utils.ts' });
  assert.deepEqual(result, { input: '/src/utils.ts' });
});

test('Agent tool extracts description and subagent_type', () => {
  const result = extractToolDisplayInfo('Agent', {
    description: 'explore codebase',
    subagent_type: 'Explore',
  });
  assert.deepEqual(result, { input: 'explore codebase', description: 'Explore' });
});

test('Bash tool extracts command and description', () => {
  const result = extractToolDisplayInfo('Bash', {
    command: 'npm test',
    description: 'Run tests',
  });
  assert.deepEqual(result, { input: 'npm test', description: 'Run tests' });
});

test('ToolSearch extracts query', () => {
  const result = extractToolDisplayInfo('ToolSearch', { query: 'select:Read' });
  assert.deepEqual(result, { input: 'select:Read' });
});

test('Grep extracts pattern and glob', () => {
  const result = extractToolDisplayInfo('Grep', { pattern: 'useState', glob: '*.tsx' });
  assert.deepEqual(result, { input: 'useState', description: '*.tsx' });
});

test('Glob extracts pattern and path', () => {
  const result = extractToolDisplayInfo('Glob', { pattern: '**/*.ts', path: 'src/' });
  assert.deepEqual(result, { input: '**/*.ts', description: 'src/' });
});

test('WebSearch extracts query', () => {
  const result = extractToolDisplayInfo('WebSearch', { query: 'preact hooks' });
  assert.deepEqual(result, { input: 'preact hooks' });
});

test('WebFetch extracts url', () => {
  const result = extractToolDisplayInfo('WebFetch', { url: 'https://example.com' });
  assert.deepEqual(result, { input: 'https://example.com' });
});

test('Skill extracts skill and args', () => {
  const result = extractToolDisplayInfo('Skill', { skill: 'commit', args: '-m fix' });
  assert.deepEqual(result, { input: 'commit', description: '-m fix' });
});

test('LSP extracts method and path', () => {
  const result = extractToolDisplayInfo('LSP', { method: 'textDocument/definition', path: '/src/app.ts' });
  assert.deepEqual(result, { input: 'textDocument/definition', description: '/src/app.ts' });
});

test('TaskCreate extracts description', () => {
  const result = extractToolDisplayInfo('TaskCreate', { description: 'Build feature' });
  assert.deepEqual(result, { input: 'Build feature' });
});

test('Fallback: returns first string value', () => {
  const result = extractToolDisplayInfo('UnknownTool', { foo: 'bar' });
  assert.deepEqual(result, { input: 'bar' });
});

test('Truncation: string > MAX_TOOL_DISPLAY_LEN chars gets truncated', () => {
  const longStr = 'a'.repeat(200);
  const result = extractToolDisplayInfo('Read', { file_path: longStr });
  assert.ok(result.input);
  assert.equal(result.input!.length, MAX_TOOL_DISPLAY_LEN + 3); // + "..."
  assert.ok(result.input!.endsWith('...'));
});

test('Empty input object returns empty result', () => {
  const result = extractToolDisplayInfo('Read', {});
  assert.deepEqual(result, {});
});

// normalizeToolInput tests

test('normalizeToolInput with JSON string object', () => {
  const result = normalizeToolInput('{"file_path":"x.ts"}');
  assert.deepEqual(result, { file_path: 'x.ts' });
});

test('normalizeToolInput with plain string', () => {
  const result = normalizeToolInput('npm test');
  assert.deepEqual(result, { _raw: 'npm test' });
});

test('normalizeToolInput with null', () => {
  assert.equal(normalizeToolInput(null), null);
});

test('normalizeToolInput with undefined', () => {
  assert.equal(normalizeToolInput(undefined), null);
});

test('normalizeToolInput with object', () => {
  const input = { file_path: '/foo.ts' };
  const result = normalizeToolInput(input);
  assert.deepEqual(result, { file_path: '/foo.ts' });
});

test('normalizeToolInput with number', () => {
  assert.equal(normalizeToolInput(42), null);
});

test('normalizeToolInput with JSON array string', () => {
  const result = normalizeToolInput('[1,2,3]');
  assert.deepEqual(result, { _raw: '[1,2,3]' });
});

test('MCP tool extracts first string value', () => {
  const result = extractToolDisplayInfo('mcp__server__tool', { path: '/some/path', extra: 42 });
  assert.deepEqual(result, { input: '/some/path' });
});

// Regression: Read/Write/Edit should accept path and filePath as fallback keys

test('Read tool accepts "path" as fallback key', () => {
  const result = extractToolDisplayInfo('Read', { path: '/fallback/path.ts' });
  assert.deepEqual(result, { input: '/fallback/path.ts' });
});

test('Edit tool accepts "filePath" as fallback key', () => {
  const result = extractToolDisplayInfo('Edit', { filePath: '/alt/file.ts' });
  assert.deepEqual(result, { input: '/alt/file.ts' });
});

test('Read tool prefers file_path over path', () => {
  const result = extractToolDisplayInfo('Read', { file_path: '/primary.ts', path: '/secondary.ts' });
  assert.deepEqual(result, { input: '/primary.ts' });
});
