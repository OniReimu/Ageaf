const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('auto-context uses path-only dedupe, not basename', () => {
  const target = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(target, 'utf8');

  // Find the auto-context block (it's inside sendMessage, after processSkillDirectives)
  const autoCtxStart = contents.indexOf('// Auto-context: attach project files matching skill patterns');
  assert.ok(autoCtxStart >= 0, 'expected auto-context block comment');
  const autoCtxBlock = contents.slice(autoCtxStart, autoCtxStart + 6000);

  // Verify path-only dedupe: uses entry.path, not entry.name
  assert.ok(
    autoCtxBlock.includes('mentionResolvedPaths.has(entry.path)'),
    'auto-context should dedupe by entry.path (canonical path)'
  );
  assert.ok(
    !autoCtxBlock.includes('mentionResolvedPaths.has(entry.name)'),
    'auto-context should NOT dedupe by entry.name (basename)'
  );

  // Verify ambiguous fallback skip warning exists
  assert.ok(
    autoCtxBlock.includes('ambiguous basename fallback'),
    'auto-context should warn about ambiguous basename fallback skips'
  );

  // Verify fallback uniqueness gate exists before findDocIdForRef
  assert.ok(
    autoCtxBlock.includes('uniqueBasename'),
    'auto-context should check basename uniqueness before fallback'
  );
});

test('processSkillDirectives returns autoContextPatterns', () => {
  const target = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(target, 'utf8');

  // Find processSkillDirectives return type
  const fnStart = contents.indexOf('const processSkillDirectives = async');
  assert.ok(fnStart >= 0, 'expected processSkillDirectives function');
  const fnBlock = contents.slice(fnStart, fnStart + 200);

  assert.ok(
    fnBlock.includes('autoContextPatterns'),
    'processSkillDirectives should return autoContextPatterns'
  );
});

test('resolveMentionFiles returns resolvedPaths set', () => {
  const target = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(target, 'utf8');

  const fnStart = contents.indexOf('const resolveMentionFiles = async');
  assert.ok(fnStart >= 0, 'expected resolveMentionFiles function');
  const fnBlock = contents.slice(fnStart, fnStart + 300);

  assert.ok(
    fnBlock.includes('resolvedPaths'),
    'resolveMentionFiles should track resolvedPaths'
  );
});

// ── Behavioral tests for addEntry dedupe and path canonicalization ──

// Replicate the addEntry + entryScore logic from detectProjectFilesFromDom
// to verify behavior without requiring a real DOM.
function makeEntry(overrides) {
  return { path: 'main.tex', name: 'main.tex', ext: 'tex', kind: 'tex', ...overrides };
}

function entryScore(e) {
  return (e.id ? 4 : 0) + (e.entityType ? 2 : 0) + (e.path.includes('/') ? 1 : 0);
}

function runAddEntry(entries) {
  const byPathKind = new Map();
  for (const entry of entries) {
    const key = `${entry.path}:${entry.kind}`.toLowerCase();
    const prev = byPathKind.get(key);
    if (!prev || entryScore(entry) > entryScore(prev)) {
      byPathKind.set(key, prev ? { ...prev, ...entry } : entry);
    }
  }
  return Array.from(byPathKind.values());
}

test('addEntry: same-basename in different folders both survive', () => {
  const entries = [
    makeEntry({ path: 'sections/main.tex', name: 'main.tex' }),
    makeEntry({ path: 'appendix/main.tex', name: 'main.tex' }),
  ];
  const result = runAddEntry(entries);
  assert.equal(result.length, 2, 'Both entries should survive (distinct paths)');
  const paths = result.map((e) => e.path).sort();
  assert.deepEqual(paths, ['appendix/main.tex', 'sections/main.tex']);
});

test('addEntry: same path+kind keeps richer metadata', () => {
  const entries = [
    makeEntry({ path: 'main.tex', name: 'main.tex' }),
    makeEntry({ path: 'main.tex', name: 'main.tex', id: 'abc123', entityType: 'doc' }),
  ];
  const result = runAddEntry(entries);
  assert.equal(result.length, 1, 'Same path:kind should dedupe');
  assert.equal(result[0].id, 'abc123', 'Should keep richer metadata');
  assert.equal(result[0].entityType, 'doc');
});

test('addEntry: folder-qualified path scores higher than basename-only', () => {
  assert.ok(
    entryScore(makeEntry({ path: 'sections/main.tex' })) >
    entryScore(makeEntry({ path: 'main.tex' })),
    'Folder-qualified path should score higher'
  );
});

test('addEntry: entry with id scores higher than entry without', () => {
  assert.ok(
    entryScore(makeEntry({ id: 'abc' })) >
    entryScore(makeEntry({})),
    'Entry with id should score higher'
  );
});

test('buildTreePath uses basename, not extracted path (no path doubling)', () => {
  const target = path.join(__dirname, '..', 'src', 'iso', 'panel', 'Panel.tsx');
  const contents = fs.readFileSync(target, 'utf8');

  // Find the line where buildTreePath is called in the detector
  const callSite = contents.indexOf('buildTreePath(node, base, kind)');
  assert.ok(
    callSite >= 0,
    'buildTreePath should be called with `base` (basename), not `extracted` (may contain slashes)'
  );

  // Verify it does NOT use extracted
  const badCallSite = contents.indexOf('buildTreePath(node, extracted, kind)');
  assert.equal(
    badCallSite,
    -1,
    'buildTreePath should NOT be called with `extracted` — risk of path doubling'
  );
});

// ── Behavioral test for auto-context canonicalization ──

test('auto-context canonicalization: id-first dedup prevents duplicates', () => {
  // Replicate the canonicalization logic from the auto-context block
  const rawEntries = [
    makeEntry({ path: 'main.tex', id: 'id1' }),
    makeEntry({ path: 'sections/main.tex', id: 'id1' }), // same id, different path
    makeEntry({ path: 'refs.bib', name: 'refs.bib', ext: 'bib', kind: 'bib' }), // no id
    makeEntry({ path: 'refs.bib', name: 'refs.bib', ext: 'bib', kind: 'bib' }), // duplicate no-id
  ];

  const rank = (e) => (e.path.includes('/') ? 2 : 0) + (e.id ? 1 : 0);

  const canonical = new Map();
  for (const entry of rawEntries) {
    const key = entry.id ? `id:${entry.id}` : `path:${entry.path.toLowerCase()}`;
    const prev = canonical.get(key);
    if (!prev || rank(entry) > rank(prev)) canonical.set(key, entry);
  }
  const result = Array.from(canonical.values());

  // id:id1 should have kept the folder-qualified path (higher rank)
  assert.equal(result.length, 2, 'Should have 2 unique entries after canonicalization');
  const id1Entry = result.find((e) => e.id === 'id1');
  assert.equal(id1Entry.path, 'sections/main.tex', 'id-keyed entry should prefer folder-qualified path');
});
