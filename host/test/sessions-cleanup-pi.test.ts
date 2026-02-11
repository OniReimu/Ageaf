import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildServer } from '../src/server.js';

test('DELETE /v1/sessions/pi/:sessionId deletes Pi session directory', async () => {
  const server = buildServer();
  const sessionId = `test-pi-${Date.now()}`;
  const sessionDir = path.join(os.homedir(), '.ageaf', 'pi', 'sessions', sessionId);

  try {
    // Create a test session directory
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'test.txt'), 'test data');
    assert.ok(fs.existsSync(sessionDir));

    // Delete via API
    const response = await server.inject({
      method: 'DELETE',
      url: `/v1/sessions/pi/${sessionId}`,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.success, true);
    assert.equal(body.provider, 'pi');
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

test('DELETE /v1/sessions/pi/:sessionId succeeds even if directory does not exist', async () => {
  const server = buildServer();
  const sessionId = `nonexistent-pi-session-${Date.now()}`;

  try {
    const response = await server.inject({
      method: 'DELETE',
      url: `/v1/sessions/pi/${sessionId}`,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.success, true);
    assert.equal(body.sessionId, sessionId);
  } finally {
    await server.close();
  }
});
