const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const panelPath = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');

// ─── Portable replica of selectBibEntry for behavioral testing ───────
// Kept in sync with Panel.tsx via source-assertion tests below.
function selectBibEntry(bibEntries, activeFile, activeFileId) {
  if (activeFile && activeFile.toLowerCase().endsWith('.bib')) {
    if (activeFileId) {
      const idMatch = bibEntries.filter((e) => e.id === activeFileId);
      if (idMatch.length === 1) return { kind: 'found', entry: idMatch[0] };
    }
    const activeNorm = activeFile.toLowerCase();
    const matches = bibEntries.filter(
      (e) => e.path.toLowerCase() === activeNorm
        || e.name.toLowerCase() === activeNorm
    );
    if (matches.length === 1) return { kind: 'found', entry: matches[0] };
    if (matches.length > 1) {
      return { kind: 'found', entry: { path: activeFile, name: activeFile, ext: '.bib', kind: 'bib' } };
    }
    const baseName = activeFile.includes('/') ? activeFile.split('/').filter(Boolean).pop() : activeFile;
    return { kind: 'found', entry: { path: activeFile, name: baseName, ext: '.bib', kind: 'bib' } };
  }
  if (bibEntries.length === 0) return { kind: 'none' };
  if (bibEntries.length === 1) return { kind: 'found', entry: bibEntries[0] };
  return { kind: 'ambiguous', paths: bibEntries.map((e) => e.path) };
}

// ─── Source-assertion tests ──────────────────────────────────────────

test('selectBibEntry function exists', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /function selectBibEntry/);
});

test('selectBibEntry accepts activeFileId parameter for stable disambiguation', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /function selectBibEntry\(\s*bibEntries.*activeFile.*activeFileId/s);
  assert.match(contents, /e\.id === activeFileId/);
});

test('selectBibEntry multi-match returns synthetic entry using activeFile (not matches[0].path)', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  // When matches.length > 1, returns a constructed entry using activeFile as both path and name
  assert.match(contents, /matches\.length > 1\).*\n.*return \{ kind: 'found', entry: \{ path: activeFile, name: activeFile/s);
});

test('selectBibEntry constructs fallback entry when active .bib has 0 matches (no fall-through)', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /activeFile\.split\('\/'\)\.filter\(Boolean\)\.pop\(\)/);
  assert.match(contents, /kind: 'found', entry: \{ path: activeFile, name: baseName/);
});

test('selectBibEntry does not fall through to singleton pick after active-file block', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  const fallbackIdx = contents.indexOf("name: baseName, ext: '.bib', kind: 'bib'");
  const singletonIdx = contents.indexOf('bibEntries.length === 0');
  assert.ok(fallbackIdx > 0, 'fallback entry should exist');
  assert.ok(singletonIdx > 0, 'singleton check should exist');
  assert.ok(singletonIdx > fallbackIdx, 'singleton check must come after fallback return');
});

test('getActiveFileId function exists and queries data-file-id', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /const getActiveFileId/);
  assert.match(contents, /getAttribute.*data-file-id/);
});

test('onCheckReferences passes activeFileId to selectBibEntry', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /selectBibEntry\(bibEntries, activeFile, activeFileId\)/);
});

test('bridge fallback tries path before basename', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /for \(const ref of \[bibEntry\.path, bibEntry\.name\]\)/);
});

test('getTreeSelectedBibFile exists and checks file tree for selected .bib', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /const getTreeSelectedBibFile/);
  assert.match(contents, /endsWith\('\.bib'\)/);
});

test('onCheckReferences falls back to tree selection when editor tab is not .bib', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /getTreeSelectedBibFile\(\)/);
  assert.match(contents, /activeFile = treeBib\.name/);
  assert.match(contents, /activeFileId = treeBib\.id/);
});

test('toStoredMessages strips content from attachments before persisting', () => {
  const contents = fs.readFileSync(panelPath, 'utf8');
  assert.match(contents, /attachments: message\.attachments\.map\(\(\{ content, \.\.\.rest \}\) => rest\)/);
});

// ─── Behavioral tests for selectBibEntry ─────────────────────────────

const mkEntry = (p, name, id) => ({ path: p, name, ext: '.bib', kind: 'bib', ...(id ? { id } : {}) });

test('behavior: single .bib, no active file → found', () => {
  const entries = [mkEntry('references.bib', 'references.bib', 'id1')];
  const result = selectBibEntry(entries, null, null);
  assert.equal(result.kind, 'found');
  assert.equal(result.entry.name, 'references.bib');
});

test('behavior: no .bib entries, no active file → none', () => {
  const result = selectBibEntry([], null, null);
  assert.equal(result.kind, 'none');
});

test('behavior: multiple .bib, no active file → ambiguous', () => {
  const entries = [
    mkEntry('dir1/refs.bib', 'refs.bib', 'id1'),
    mkEntry('dir2/refs.bib', 'refs.bib', 'id2'),
  ];
  const result = selectBibEntry(entries, null, null);
  assert.equal(result.kind, 'ambiguous');
  assert.deepEqual(result.paths, ['dir1/refs.bib', 'dir2/refs.bib']);
});

test('behavior: active .bib with file id disambiguates duplicate basenames', () => {
  const entries = [
    mkEntry('dir1/refs.bib', 'refs.bib', 'id1'),
    mkEntry('dir2/refs.bib', 'refs.bib', 'id2'),
  ];
  const result = selectBibEntry(entries, 'refs.bib', 'id2');
  assert.equal(result.kind, 'found');
  assert.equal(result.entry.path, 'dir2/refs.bib');
  assert.equal(result.entry.id, 'id2');
});

test('behavior: active .bib with duplicate basenames and no file id returns synthetic entry without id', () => {
  const entries = [
    mkEntry('dir1/refs.bib', 'refs.bib', 'id1'),
    mkEntry('dir2/refs.bib', 'refs.bib', 'id2'),
  ];
  const result = selectBibEntry(entries, 'refs.bib', null);
  assert.equal(result.kind, 'found');
  // Synthetic entry must NOT carry an id (prevents wrong doc-download)
  assert.equal(result.entry.id, undefined);
  // Both path and name use activeFile (basename) to avoid bridge resolving wrong duplicate
  assert.equal(result.entry.path, 'refs.bib');
  assert.equal(result.entry.name, 'refs.bib');
});

test('behavior: active .bib not in DOM entries constructs fallback', () => {
  const entries = [mkEntry('other.bib', 'other.bib', 'id1')];
  const result = selectBibEntry(entries, 'new.bib', null);
  assert.equal(result.kind, 'found');
  assert.equal(result.entry.path, 'new.bib');
  assert.equal(result.entry.name, 'new.bib');
  assert.equal(result.entry.id, undefined);
});

test('behavior: active .bib with path extracts basename for fallback', () => {
  const result = selectBibEntry([], 'sections/refs.bib', null);
  assert.equal(result.kind, 'found');
  assert.equal(result.entry.path, 'sections/refs.bib');
  assert.equal(result.entry.name, 'refs.bib');
});

test('behavior: active non-.bib file with single .bib entry → found', () => {
  const entries = [mkEntry('refs.bib', 'refs.bib', 'id1')];
  const result = selectBibEntry(entries, 'main.tex', null);
  assert.equal(result.kind, 'found');
  assert.equal(result.entry.name, 'refs.bib');
});

test('behavior: active non-.bib file with multiple .bib entries → ambiguous', () => {
  const entries = [
    mkEntry('refs.bib', 'refs.bib', 'id1'),
    mkEntry('extra.bib', 'extra.bib', 'id2'),
  ];
  const result = selectBibEntry(entries, 'main.tex', null);
  assert.equal(result.kind, 'ambiguous');
});

test('behavior: tree-selected .bib resolves ambiguity (simulates getTreeSelectedBibFile fallback)', () => {
  // When editor tab is main.tex but tree has references.bib selected,
  // the handler overrides activeFile/activeFileId before calling selectBibEntry.
  // This test simulates that override.
  const entries = [
    mkEntry('refs.bib', 'refs.bib', 'id1'),
    mkEntry('extra.bib', 'extra.bib', 'id2'),
    mkEntry('references.bib', 'references.bib', 'id3'),
  ];
  // Without tree fallback: ambiguous
  const ambiguous = selectBibEntry(entries, 'main.tex', null);
  assert.equal(ambiguous.kind, 'ambiguous');
  // With tree fallback: handler sets activeFile='references.bib', activeFileId='id3'
  const resolved = selectBibEntry(entries, 'references.bib', 'id3');
  assert.equal(resolved.kind, 'found');
  assert.equal(resolved.entry.name, 'references.bib');
  assert.equal(resolved.entry.id, 'id3');
});
