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
