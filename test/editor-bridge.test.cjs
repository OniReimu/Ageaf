const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Main editor bridge registers Ageaf events', () => {
  const bridgePath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'editorBridge',
    'bridge.ts'
  );
  const contents = fs.readFileSync(bridgePath, 'utf8');

  assert.match(contents, /registerEditorBridge/);
  assert.match(contents, /ageaf:editor:request/);
  assert.match(contents, /ageaf:editor:response/);
  assert.match(contents, /ageaf:editor:replace/);
  assert.match(contents, /ageaf:editor:insert/);
});

test('registerEditorBridge tolerates early tracker bootstrap failure and still registers listeners', () => {
  const bridgePath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'editorBridge',
    'bridge.ts'
  );
  const contents = fs.readFileSync(bridgePath, 'utf8');

  assert.match(contents, /export function registerEditorBridge\(\)/);
  assert.match(contents, /try \{\s*installDispatchTracker\(getTrackedCmView\(\)\);\s*emitHistoryState\(\);/m);
  assert.match(contents, /\} catch \{\s*\/\/ Editor boot can race bridge registration; lazy init on first request\./m);
  assert.match(contents, /window\.addEventListener\(REQUEST_EVENT, onSelectionRequest as EventListener\);/);
});
