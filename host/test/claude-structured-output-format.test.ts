import assert from 'node:assert/strict';
import test from 'node:test';

test('Claude structured output format includes patch schema', async () => {
  const module = await import('../src/runtimes/claude/agent.js');
  const getStructuredOutputFormat = module.getStructuredOutputFormat as
    | ((name?: string) => { type: string; schema: Record<string, unknown> } | null)
    | undefined;

  assert.equal(typeof getStructuredOutputFormat, 'function');
  const format = getStructuredOutputFormat?.('patch');
  assert.equal(format?.type, 'json_schema');
  const schema = format?.schema as Record<string, any> | undefined;
  assert.ok(Array.isArray(schema?.oneOf));
  const oneOf = schema.oneOf;
  const kinds = oneOf.map((entry) => entry?.properties?.kind?.const).filter(Boolean);
  assert.ok(kinds.includes('replaceSelection'));
  assert.ok(kinds.includes('insertAtCursor'));
  assert.ok(kinds.includes('replaceRangeInFile'));
  const replaceRange = oneOf.find((entry) => entry?.properties?.kind?.const === 'replaceRangeInFile');
  assert.equal(replaceRange?.properties?.filePath?.type, 'string');
  assert.equal(replaceRange?.properties?.expectedOldText?.type, 'string');
});
