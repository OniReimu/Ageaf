const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel handles file_started events with reviewing status updates', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /event\.event === 'file_started'/);
  assert.match(contents, /statusPrefix = `Reviewing: \$\{displayPath\}`/);
  assert.match(contents, /formatStreamingStatusLine\(\s*`Reviewing: \$\{displayPath\}`/);
});

test('Panel renders and persists patch review cards during active streaming', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /pendingPatchReviewMessages\.push\(/);
  assert.match(
    contents,
    /setMessages\(\(prev\)\s*=>\s*\[\s*\.\.\.prev,\s*createMessage\(patchMessage\),\s*\]\)/s
  );
  assert.match(
    contents,
    /setConversationMessages\(\s*baseState,\s*baseConversation\.provider,\s*sessionConversationId,\s*updatedStored\s*\)/s
  );
});

test('Panel re-reads latest conversation state before mid-stream patch persistence', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /const latestState = chatStateRef\.current/);
  assert.match(
    contents,
    /const latestConversation = latestState\s*\?\s*findConversation\(latestState,\s*sessionConversationId\)\s*:\s*null/
  );
  assert.match(contents, /const baseState = latestState \?\? state/);
  assert.match(contents, /const baseConversation = latestConversation \?\? conversation/);
});

test('Panel finalization inserts assistant before trailing patches and deduplicates pending queue', () => {
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
    /assistantInsertIndex[\s\S]*updatedMessages\.splice\(assistantInsertIndex,\s*0,/s
  );
  assert.match(contents, /existingPatchSet = new Set\(/);
  assert.match(contents, /pendingPatchReviewMessages\.filter\(/);
});

test('Panel assistant insertion scan is bounded to the current stream window', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /preStreamMessageCount/);
  assert.match(
    contents,
    /const preStreamCount = Math\.min\(\s*sessionState\.preStreamMessageCount \?\? updatedMessages\.length,\s*updatedMessages\.length\s*\)/
  );
  assert.match(contents, /for \(let i = updatedMessages\.length - 1; i >= preStreamCount; i--\)/);
});

test('Panel patch preview rendering does not require non-null assertion', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.doesNotMatch(contents, /storedPatchReviewMessage!/);
});

test('Panel records preStreamMessageCount including the pending user message', () => {
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
    /sessionState\.preStreamMessageCount\s*=\s*\(\s*streamStartConversation\?\.messages\.length\s*\?\?\s*0\s*\)\s*\+\s*1/
  );
});

test('Panel renders mid-stream cards after the streaming bubble', () => {
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
    /messages\.slice\(0,\s*preStreamCount\)\.map\(renderMessageBubble\)/
  );
  assert.match(
    contents,
    /messages\.slice\(preStreamCount\)\.map\(renderMessageBubble\)/
  );
});
