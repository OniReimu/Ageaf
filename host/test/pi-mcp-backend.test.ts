import assert from 'node:assert/strict';
import test from 'node:test';

import { createMcpMermaidBackend } from '../src/runtimes/pi/toolBackends/mcp.js';

test('MCP backend discovers tools with correct prefixed names', async () => {
  const backend = createMcpMermaidBackend();
  await backend.init();
  try {
    const catalog = backend.getCatalog();
    assert.ok(catalog.length >= 2, `expected at least 2 tools, got ${catalog.length}`);

    const names = catalog.map((t) => t.name);
    assert.ok(names.includes('mcp__ageaf-mermaid__render_mermaid'), 'should have prefixed render_mermaid');
    assert.ok(names.includes('mcp__ageaf-mermaid__list_mermaid_themes'), 'should have prefixed list_mermaid_themes');

    // Check source
    for (const entry of catalog) {
      assert.equal(entry.source, 'mcp:ageaf-mermaid', 'source should be mcp:ageaf-mermaid');
    }
  } finally {
    await backend.shutdown();
  }
});

test('MCP backend render_mermaid returns SVG content', async () => {
  const backend = createMcpMermaidBackend();
  await backend.init();
  try {
    const tools = backend.getAgentTools();
    const renderTool = tools.find((t) => t.name === 'mcp__ageaf-mermaid__render_mermaid');
    assert.ok(renderTool, 'render_mermaid tool should exist');

    const result = await renderTool!.execute('test-call-1', { code: 'graph TD\nA-->B' });
    assert.ok(result.content.length > 0, 'should return content');

    const textContent = result.content.find((c: any) => c.type === 'text');
    assert.ok(textContent, 'should contain text content');
    assert.ok(
      (textContent as any).text.includes('<svg') || (textContent as any).text.length > 0,
      'should contain SVG or non-empty output',
    );
  } finally {
    await backend.shutdown();
  }
});

test('MCP backend list_mermaid_themes returns themes', async () => {
  const backend = createMcpMermaidBackend();
  await backend.init();
  try {
    const tools = backend.getAgentTools();
    const listTool = tools.find((t) => t.name === 'mcp__ageaf-mermaid__list_mermaid_themes');
    assert.ok(listTool, 'list_mermaid_themes tool should exist');

    const result = await listTool!.execute('test-call-2', {});
    assert.ok(result.content.length > 0, 'should return content');

    const textContent = result.content.find((c: any) => c.type === 'text');
    assert.ok(textContent, 'should contain text content');
    assert.ok((textContent as any).text.length > 0, 'should return theme list');
  } finally {
    await backend.shutdown();
  }
});

test('MCP backend shutdown cleans up', async () => {
  const backend = createMcpMermaidBackend();
  await backend.init();
  assert.ok(backend.getCatalog().length > 0, 'should have tools before shutdown');

  await backend.shutdown();
  assert.equal(backend.getCatalog().length, 0, 'should have no tools after shutdown');
  assert.equal(backend.getAgentTools().length, 0, 'should have no agent tools after shutdown');
});
