const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('Panel defines file summary computation and imports summary card component', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(
    contents,
    /function computeFileSummary\(messages: Message\[\]\): FileSummaryEntry\[\]/
  );
  assert.match(
    contents,
    /import \{ FileChangeSummaryCard,\s*type FileSummaryEntry \} from '\.\/FileChangeSummaryCard';/
  );
  assert.doesNotMatch(contents, /type FileSummaryEntry = \{/);
});

test('Panel file summary only aggregates pending hunks', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(contents, /if \(status !== 'pending'\) continue;/);
});

test('Panel extracts acceptSinglePatch and uses it from single and bulk accept paths', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(contents, /const acceptSinglePatch = async \(/);
  assert.match(contents, /await acceptSinglePatch\(messageId,\s*patchReview,\s*overrideText\)/);
  assert.match(contents, /await acceptSinglePatch\(latest\.id,\s*latest\.patchReview\)/);
});

test('Panel defines bulk accept and bulk reject handlers', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(contents, /const \[bulkActionBusy,\s*setBulkActionBusy\] = useState\(false\)/);
  assert.match(contents, /const onBulkAcceptAll = async \(\) => \{/);
  assert.match(contents, /const onBulkRejectAll = \(\) => \{/);
});

test('Panel renders FileChangeSummaryCard with summary props', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(contents, /const fileSummary = computeFileSummary\(messages\)/);
  assert.match(contents, /<FileChangeSummaryCard/);
  assert.match(contents, /onAcceptAll=\{onBulkAcceptAll\}/);
  assert.match(contents, /onRejectAll=\{onBulkRejectAll\}/);
  assert.match(contents, /onNavigateToFile=\{onNavigateToFile\}/);
});

test('Panel anchors summary card between chat and runtime and only when pending exists', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(contents, /const showSummaryCard = totalPending > 0;/);
  assert.match(
    contents,
    /<\/div>\s*\{showSummaryCard \? \(\s*<FileChangeSummaryCard[\s\S]*?\) : null\}\s*<div class="ageaf-runtime">/
  );
});

test('contentScript exposes navigateToFile bridge call', () => {
  const contents = read('src/iso/contentScript.ts');

  assert.match(contents, /const EDITOR_FILE_NAVIGATE_REQUEST_EVENT = 'ageaf:editor:file-navigate:request';/);
  assert.match(contents, /const EDITOR_FILE_NAVIGATE_RESPONSE_EVENT = 'ageaf:editor:file-navigate:response';/);
  assert.match(contents, /function navigateToFile\(name: string\)/);
  assert.match(contents, /window\.addEventListener\(EDITOR_FILE_NAVIGATE_RESPONSE_EVENT,\s*onFileNavigateResponse as EventListener\)/);
  assert.match(contents, /navigateToFile,/);
});

test('editor bridge listens for file navigation requests', () => {
  const contents = read('src/main/editorBridge/bridge.ts');

  assert.match(contents, /const FILE_NAVIGATE_REQUEST_EVENT = 'ageaf:editor:file-navigate:request';/);
  assert.match(contents, /const FILE_NAVIGATE_RESPONSE_EVENT = 'ageaf:editor:file-navigate:response';/);
  assert.match(contents, /async function onFileNavigateRequest\(event: Event\)/);
  assert.match(contents, /window\.addEventListener\(FILE_NAVIGATE_REQUEST_EVENT,\s*onFileNavigateRequest as EventListener\)/);
});

test('summary card component and CSS class exist', () => {
  const panelCss = read('src/iso/panel/panel.css');
  const summaryCard = read('src/iso/panel/FileChangeSummaryCard.tsx');

  assert.match(panelCss, /\.ageaf-file-summary\b/);
  assert.match(summaryCard, /export function FileChangeSummaryCard/);
});

test('Panel groups replaceRangeInFile patches by file for rendering', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(contents, /fileGroupMap/);
  assert.match(contents, /fileGroupRole/);
  assert.match(contents, /GroupedPatchReviewCard/);
});

test('GroupedPatchReviewCard component exists', () => {
  const contents = read('src/iso/panel/GroupedPatchReviewCard.tsx');

  assert.match(contents, /export function GroupedPatchReviewCard/);
  assert.match(contents, /ageaf-grouped-patch__separator/);
});

test('Panel memoizes grouped patch maps from messages', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(contents, /const \{ messageById, fileGroupMap, fileGroupRole \} = useMemo\(/);
});

test('Panel per-file accept path builds an O\\(1\\) lookup map from messagesRef', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(
    contents,
    /const currentById = new Map\(messagesRef\.current\.map\(\(entry\) => \[entry\.id, entry\]\)\);/
  );
});

test('GroupedPatchReviewCard derives status counts in a single pass and guards empty hunks', () => {
  const contents = read('src/iso/panel/GroupedPatchReviewCard.tsx');

  assert.match(contents, /if \(sortedHunks\.length === 0\) return null;/);
  assert.match(contents, /let pending = 0;/);
  assert.match(contents, /let accepted = 0;/);
  assert.match(contents, /let rejected = 0;/);
});

test('GroupedPatchReviewCard keeps a header expand control for full diff modal', () => {
  const contents = read('src/iso/panel/GroupedPatchReviewCard.tsx');

  assert.match(contents, /class=\"ageaf-patch-review__expand-btn\"/);
  assert.match(contents, /aria-label=\"Expand diff to full screen\"/);
  assert.match(contents, /const \[showModal,\s*setShowModal\] = useState\(false\);/);
});

test('expand control styles use visible foreground and chrome token', () => {
  const panelCss = read('src/iso/panel/panel.css');

  assert.match(panelCss, /\.ageaf-patch-review__expand-btn \{[^}]*color:\s*var\(--ageaf-panel-text\);/);
  assert.match(panelCss, /\.ageaf-patch-review__expand-btn \{[^}]*border:\s*1px solid /);
  assert.match(panelCss, /\.ageaf-patch-review__expand-icon \{[^}]*color:\s*var\(--ageaf-panel-text\);/);
});

test('Panel keeps replaceRangeInFile groups across status transitions', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(
    contents,
    /const \{ messageById, fileGroupMap, fileGroupRole \} = useMemo\(\(\) => \{[\s\S]*?const fileKey = patchReview\.filePath\.toLowerCase\(\);/
  );
  assert.doesNotMatch(
    contents,
    /const \{ messageById, fileGroupMap, fileGroupRole \} = useMemo\(\(\) => \{[\s\S]*?const status = \(patchReview as any\)\.status \?\? 'pending';[\s\S]*?if \(status !== 'pending'\) continue;/
  );
});

test('Panel backfills missing lineFrom using file content and from offset', () => {
  const contents = read('src/iso/panel/Panel.tsx');

  assert.match(contents, /function computeLineFromOffset\(content: string, from: number\)/);
  assert.match(contents, /requestFileContent\(group\.filePath\)/);
  assert.match(contents, /const lineFrom = computeLineFromOffset\(content, entry\.from\);/);
});
