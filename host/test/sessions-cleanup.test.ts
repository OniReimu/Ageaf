import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildServer } from '../src/server.js';

test('DELETE /v1/sessions/:provider/:sessionId deletes Claude session directory', async () => {
  const server = buildServer();
  const sessionId = `test-claude-${Date.now()}`;
  const sessionDir = path.join(os.homedir(), '.ageaf', 'claude', 'sessions', sessionId);

  try {
    // Create a test session directory
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'test.txt'), 'test data');
    assert.ok(fs.existsSync(sessionDir));

    // Delete via API
    const response = await server.inject({
      method: 'DELETE',
      url: `/v1/sessions/claude/${sessionId}`,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.success, true);
    assert.equal(body.provider, 'claude');
    assert.equal(body.sessionId, sessionId);

    // Verify directory was deleted
    assert.ok(!fs.existsSync(sessionDir), 'Session directory should be deleted');
  } finally {
    // Cleanup
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    await server.close();
  }
});

test('DELETE /v1/sessions/:provider/:sessionId deletes Codex session directory', async () => {
  const server = buildServer();
  const sessionId = `test-codex-${Date.now()}`;
  const sessionDir = path.join(os.homedir(), '.ageaf', 'codex', 'sessions', sessionId);

  try {
    // Create a test session directory
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'test.txt'), 'test data');
    assert.ok(fs.existsSync(sessionDir));

    // Delete via API
    const response = await server.inject({
      method: 'DELETE',
      url: `/v1/sessions/codex/${sessionId}`,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.success, true);
    assert.equal(body.provider, 'codex');
    assert.equal(body.sessionId, sessionId);

    // Verify directory was deleted
    assert.ok(!fs.existsSync(sessionDir), 'Session directory should be deleted');
  } finally {
    // Cleanup
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    await server.close();
  }
});

test('DELETE /v1/sessions/:provider/:sessionId returns 400 for invalid provider', async () => {
  const server = buildServer();

  try {
    const response = await server.inject({
      method: 'DELETE',
      url: '/v1/sessions/invalid-provider/test-id',
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.ok(body.error.includes('Invalid provider'));
  } finally {
    await server.close();
  }
});

test('DELETE /v1/sessions/:provider/:sessionId succeeds even if directory does not exist', async () => {
  const server = buildServer();
  const sessionId = `nonexistent-session-${Date.now()}`;

  try {
    const response = await server.inject({
      method: 'DELETE',
      url: `/v1/sessions/claude/${sessionId}`,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.success, true);
    assert.equal(body.sessionId, sessionId);
  } finally {
    await server.close();
  }
});

