const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Inline diff overlay action buttons are ordered accept, reject, feedback', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  const widgetStart = contents.indexOf('function createWidgetDOM');
  assert.ok(widgetStart >= 0, 'expected createWidgetDOM');
  const widgetEnd = contents.indexOf('return wrap;', widgetStart);
  assert.ok(widgetEnd >= 0, 'expected createWidgetDOM end');
  const widget = contents.slice(widgetStart, widgetEnd);

  const acceptIdx = widget.indexOf('actions.appendChild(acceptBtn)');
  const rejectIdx = widget.indexOf('actions.appendChild(rejectBtn)');
  const feedbackIdx = widget.indexOf('actions.appendChild(feedbackBtn)');
  assert.ok(acceptIdx >= 0, 'expected widget accept button append');
  assert.ok(rejectIdx >= 0, 'expected widget reject button append');
  assert.ok(feedbackIdx >= 0, 'expected widget feedback button append');
  assert.ok(
    acceptIdx < rejectIdx && rejectIdx < feedbackIdx,
    'expected widget order accept < reject < feedback'
  );

  const additionStart = contents.indexOf(
    "actions.className = 'ageaf-inline-diff-addition__actions';"
  );
  assert.ok(additionStart >= 0, 'expected addition overlay actions');
  const additionEnd = contents.indexOf('added.appendChild(actions);', additionStart);
  assert.ok(additionEnd >= 0, 'expected addition overlay actions end');
  const addition = contents.slice(additionStart, additionEnd);

  const acceptBlockIdx = addition.indexOf('actions.appendChild(accept);');
  const rejectBlockIdx = addition.indexOf('actions.appendChild(reject);');
  const feedbackBlockIdx = addition.indexOf('actions.appendChild(feedback);');
  assert.ok(acceptBlockIdx >= 0, 'expected addition accept append');
  assert.ok(rejectBlockIdx >= 0, 'expected addition reject append');
  assert.ok(feedbackBlockIdx >= 0, 'expected addition feedback append');
  assert.ok(
    acceptBlockIdx < rejectBlockIdx && rejectBlockIdx < feedbackBlockIdx,
    'expected addition order accept < reject < feedback'
  );
});

test('Inline diff review bar labels are file-scoped', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  assert.match(contents, /undoAll\.textContent = 'Undo File';/);
  assert.match(contents, /acceptAll\.textContent = 'Accept File';/);
  assert.doesNotMatch(contents, /undoAll\.textContent = 'Undo All';/);
  assert.doesNotMatch(contents, /acceptAll\.textContent = 'Accept All';/);
});

test('Inline diff file-level accept applies hunks from bottom to top', () => {
  const overlayPath = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'inlineDiffOverlay.ts'
  );
  const contents = fs.readFileSync(overlayPath, 'utf8');

  const runBulkStart = contents.indexOf("const runBulk = async (action: 'accept' | 'reject') => {");
  assert.ok(runBulkStart >= 0, 'expected runBulk definition');
  const runBulkEnd = contents.indexOf('};', runBulkStart);
  assert.ok(runBulkEnd >= 0, 'expected runBulk end');
  const runBulk = contents.slice(runBulkStart, runBulkEnd);

  assert.match(
    runBulk,
    /action === 'accept' \? b\.from - a\.from : a\.from - b\.from/,
    'expected accept to sort descending by from to avoid offset shift'
  );
});
