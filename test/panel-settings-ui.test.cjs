const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Panel includes settings button and tabs', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-panel__settings/);
  assert.match(contents, /Connection/);
  assert.match(contents, /Authentication/);
  assert.doesNotMatch(contents, /Advanced/);
});

test('Panel includes empty state landing page', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-landing/);
  assert.match(contents, /ageaf-landing__card/);
  assert.match(contents, /How-to Guides/);
});

test('Landing page uses large icon and uppercase slogan', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /icon_256\.png/);
  assert.match(contents, /YOUR OVERLEAF AGENT/);
});

test('Panel header includes help button', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const contents = fs.readFileSync(panelPath, 'utf8');

  assert.match(contents, /ageaf-panel__help/);
});

test('Manifest exposes landing logo asset', () => {
  const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const resources = manifest.web_accessible_resources?.[0]?.resources ?? [];

  assert.ok(resources.includes('icons/icon_256.png'));
});

test('Landing page background is transparent', () => {
  const cssPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'panel.css'
  );
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(
    contents,
    /\.ageaf-landing\s*\{[\s\S]*background:\s*transparent;/
  );
});

test('Landing page centers main content block', () => {
  const panelPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'Panel.tsx'
  );
  const cssPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'panel.css'
  );
  const panelContents = fs.readFileSync(panelPath, 'utf8');
  const cssContents = fs.readFileSync(cssPath, 'utf8');

  assert.match(panelContents, /ageaf-landing__content/);
  assert.match(
    cssContents,
    /\.ageaf-landing__content\s*\{[\s\S]*justify-content:\s*center;/
  );
});

test('Landing page body spans full panel height', () => {
  const cssPath = path.join(
    __dirname,
    '..',
    'src',
    'iso',
    'panel',
    'panel.css'
  );
  const contents = fs.readFileSync(cssPath, 'utf8');

  assert.match(
    contents,
    /\.ageaf-panel__body:has\(.ageaf-landing\)\s*\{[\s\S]*grid-row:\s*1\s*\/\s*-1;/
  );
});
