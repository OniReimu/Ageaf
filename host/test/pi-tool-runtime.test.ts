import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initToolRuntime,
  getToolCatalog,
  getAllAgentTools,
  shutdownToolRuntime,
} from '../src/runtimes/pi/toolRuntime.js';

test('initToolRuntime + getToolCatalog returns expected tools', async () => {
  await initToolRuntime();
  try {
    const catalog = getToolCatalog();
    assert.ok(catalog.length >= 4, `expected at least 4 tools, got ${catalog.length}`);

    const names = catalog.map((t) => t.name);
    assert.ok(names.includes('mcp__ageaf-mermaid__render_mermaid'), 'should have render_mermaid');
    assert.ok(names.includes('mcp__ageaf-mermaid__list_mermaid_themes'), 'should have list_mermaid_themes');
    assert.ok(names.includes('web_search'), 'should have web_search');
    assert.ok(names.includes('web_fetch'), 'should have web_fetch');
  } finally {
    await shutdownToolRuntime();
  }
});

test('getAllAgentTools returns AgentTool instances', async () => {
  await initToolRuntime();
  try {
    const tools = getAllAgentTools();
    assert.ok(tools.length >= 4, `expected at least 4 agent tools, got ${tools.length}`);

    for (const tool of tools) {
      assert.ok(typeof tool.name === 'string' && tool.name.length > 0, 'tool must have a name');
      assert.ok(typeof tool.execute === 'function', 'tool must have an execute function');
      assert.ok(tool.parameters, 'tool must have parameters');
    }
  } finally {
    await shutdownToolRuntime();
  }
});

test('getToolCatalog throws before init', async () => {
  // Ensure clean state
  await shutdownToolRuntime();

  assert.throws(
    () => getToolCatalog(),
    /not initialized/,
    'should throw when not initialized',
  );
});

test('initToolRuntime is idempotent (second call is fast)', async () => {
  await initToolRuntime();
  try {
    // Second call should return immediately
    await initToolRuntime();
    const catalog = getToolCatalog();
    assert.ok(catalog.length >= 4, 'catalog should still be populated');
  } finally {
    await shutdownToolRuntime();
  }
});

test('shutdownToolRuntime is idempotent', async () => {
  await initToolRuntime();
  await shutdownToolRuntime();
  // Second call should be a no-op
  await shutdownToolRuntime();
});
