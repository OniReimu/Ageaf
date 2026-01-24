import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ORIGIN = 'https://www.overleaf.com';

function makeTempSettingsPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ageaf-host-settings-'));
  return path.join(dir, 'host-settings.json');
}

test('GET /v1/host/tools returns status', async () => {
  process.env.AGEAF_START_SERVER = 'false';
  process.env.AGEAF_HOST_SETTINGS_PATH = makeTempSettingsPath();

  const { buildServer } = await import('../src/server.js');
  const server = buildServer();
  await server.listen({ port: 0, host: '127.0.0.1' });

  try {
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('Server did not bind');

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/host/tools`, {
      headers: { Origin: ORIGIN },
    });
    assert.equal(response.status, 200);
    const json = (await response.json()) as any;
    assert.equal(typeof json.toolsEnabled, 'boolean');
    assert.equal(typeof json.toolsAvailable, 'boolean');
    assert.equal(typeof json.remoteToggleAllowed, 'boolean');
  } finally {
    delete process.env.AGEAF_HOST_SETTINGS_PATH;
    await server.close();
  }
});

test('POST /v1/host/tools is forbidden unless AGEAF_ALLOW_REMOTE_TOOL_TOGGLE=true', async () => {
  process.env.AGEAF_START_SERVER = 'false';
  process.env.AGEAF_HOST_SETTINGS_PATH = makeTempSettingsPath();
  delete process.env.AGEAF_ALLOW_REMOTE_TOOL_TOGGLE;

  const { buildServer } = await import('../src/server.js');
  const server = buildServer();
  await server.listen({ port: 0, host: '127.0.0.1' });

  try {
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('Server did not bind');

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/host/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(response.status, 403);
  } finally {
    delete process.env.AGEAF_HOST_SETTINGS_PATH;
    await server.close();
  }
});

test('POST /v1/host/tools persists when remote toggle is allowed', async () => {
  process.env.AGEAF_START_SERVER = 'false';
  process.env.AGEAF_ALLOW_REMOTE_TOOL_TOGGLE = 'true';
  const settingsPath = makeTempSettingsPath();
  process.env.AGEAF_HOST_SETTINGS_PATH = settingsPath;

  const { buildServer } = await import('../src/server.js');
  const server = buildServer();
  await server.listen({ port: 0, host: '127.0.0.1' });

  try {
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('Server did not bind');

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/host/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(response.status, 200);
    const json = (await response.json()) as any;
    assert.equal(json.toolsEnabled, true);

    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as any;
    assert.equal(stored.toolsEnabled, true);
  } finally {
    delete process.env.AGEAF_HOST_SETTINGS_PATH;
    delete process.env.AGEAF_ALLOW_REMOTE_TOOL_TOGGLE;
    await server.close();
  }
});


