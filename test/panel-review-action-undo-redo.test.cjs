const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel defines review action undo/redo stacks and executors', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /type ReviewActionHistoryEntry\s*=/);
  assert.match(contents, /reviewUndoStackRef/);
  assert.match(contents, /reviewRedoStackRef/);
  assert.match(contents, /executeReviewUndo/);
  assert.match(contents, /executeReviewRedo/);
  assert.match(contents, /ageafBridge\?\.undoEditor/);
  assert.match(contents, /ageafBridge\?\.redoEditor/);
});

test('Panel records history for bulk and file-level review actions', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(
    contents,
    /const onBulkAcceptAll = async \(\) => \{[\s\S]*recordReviewAction\(/m
  );
  assert.match(
    contents,
    /const onBulkRejectAll = \(\) => \{[\s\S]*recordReviewAction\(/m
  );
  assert.match(
    contents,
    /const onAcceptFilePatches = async \(fileKey: string\) => \{[\s\S]*recordReviewAction\(/m
  );
  assert.match(
    contents,
    /const onRejectFilePatches = \(fileKey: string\) => \{[\s\S]*recordReviewAction\(/m
  );
});

test('Panel shortcut handler supports global non-typing contexts', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /const isTypingTarget = \(target: EventTarget \| null\) =>/);
  assert.match(contents, /const isTypingContext = isTypingTarget\(event\.target\) \|\| isTypingTarget\(active\);/);
  assert.match(contents, /if \(isTypingContext && !editorContext\) return;/);
});

test('Panel only intercepts review undo shortcuts when review history is next chronologically', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /editorHistoryMarker/);
  assert.match(contents, /currentEditorHistoryMarker/);
  assert.match(contents, /const topReviewEntry = isUndo[\s\S]*reviewRedoStackRef\.current\[reviewRedoStackRef\.current\.length - 1\]/m);
  assert.match(contents, /editorContext &&/);
  assert.match(contents, /typeof topReviewEntry\.editorHistoryMarker === 'number'/);
  assert.match(contents, /currentEditorHistoryMarker !== topReviewEntry\.editorHistoryMarker/);
  assert.match(contents, /return;/);
});

test('Content script exposes undoEditor/redoEditor bridge methods', () => {
  const scriptPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'contentScript.ts'
  );
  const contents = fs.readFileSync(scriptPath, 'utf8');

  assert.match(contents, /EDITOR_HISTORY_REQUEST_EVENT/);
  assert.match(contents, /EDITOR_HISTORY_RESPONSE_EVENT/);
  assert.match(contents, /EDITOR_HISTORY_STATE_EVENT/);
  assert.match(contents, /undoEditor:\s*\(\)\s*=>\s*Promise<\{ ok: boolean; error\?: string \}>/);
  assert.match(contents, /redoEditor:\s*\(\)\s*=>\s*Promise<\{ ok: boolean; error\?: string \}>/);
  assert.match(contents, /getEditorHistoryMarker:\s*\(\)\s*=>\s*currentEditorHistoryMarker/);
});

test('Editor bridge handles undo/redo history requests', () => {
  const bridgePath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'editorBridge',
    'bridge.ts'
  );
  const contents = fs.readFileSync(bridgePath, 'utf8');

  assert.match(contents, /const HISTORY_REQUEST_EVENT = 'ageaf:editor:history:request';/);
  assert.match(contents, /const HISTORY_RESPONSE_EVENT = 'ageaf:editor:history:response';/);
  assert.match(contents, /const HISTORY_STATE_EVENT = 'ageaf:editor:history:state';/);
  assert.match(contents, /interface HistoryRequest/);
  assert.match(contents, /function onHistoryRequest\(event: Event\)/);
  assert.match(contents, /v\.startsWith\('undo'\)/);
  assert.match(contents, /v\.startsWith\('redo'\)/);
  assert.match(
    contents,
    /window\.dispatchEvent\(\s*new CustomEvent\(HISTORY_RESPONSE_EVENT/
  );
  assert.match(
    contents,
    /window\.dispatchEvent\(\s*new CustomEvent\(HISTORY_STATE_EVENT/
  );
});
