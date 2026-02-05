const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Homebrew formula exists for macOS companion host', () => {
  const formulaPath = path.join(
    __dirname,
    '..',
    'host',
    'scripts',
    'homebrew',
    'ageaf-host.rb'
  );
  const contents = fs.readFileSync(formulaPath, 'utf8');

  assert.match(contents, /class\s+AgeafHost\s+<\s+Formula/);
  assert.match(contents, /com\.ageaf\.host/);
  assert.match(contents, /ageaf-host-install-manifest/);
  assert.match(contents, /NativeMessagingHosts/);
});

test('README documents Homebrew installation and unsigned installer warning', () => {
  const readmePath = path.join(__dirname, '..', 'README.md');
  const contents = fs.readFileSync(readmePath, 'utf8');

  assert.match(contents, /Homebrew/i);
  assert.match(contents, /brew\s+install/i);
  assert.match(contents, /unsigned/i);
  assert.match(contents, /Privacy\s*&\s*Security/i);
});
