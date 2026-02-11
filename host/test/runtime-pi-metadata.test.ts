import assert from 'node:assert/strict';
import test from 'node:test';

import { buildServer } from '../src/server.js';

test('GET /v1/runtime/pi/metadata returns models and thinking levels', async () => {
  const server = buildServer();

  try {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/runtime/pi/metadata',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    // Should have models array (may be empty if no API keys are set)
    assert.ok(Array.isArray(body.models), 'models should be an array');

    // Should have thinkingLevels array
    assert.ok(Array.isArray(body.thinkingLevels), 'thinkingLevels should be an array');
    assert.ok(body.thinkingLevels.length > 0, 'should have at least one thinking level');

    // Should have currentThinkingLevel
    assert.ok(
      typeof body.currentThinkingLevel === 'string',
      'currentThinkingLevel should be a string'
    );
  } finally {
    await server.close();
  }
});

test('POST /v1/runtime/pi/preferences updates and returns thinking level', async () => {
  const server = buildServer();

  try {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/runtime/pi/preferences',
      payload: {
        thinkingLevel: 'high',
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.currentThinkingLevel, 'high');
  } finally {
    await server.close();
  }
});

test('POST /v1/runtime/pi/preferences ignores invalid thinking level', async () => {
  const server = buildServer();

  try {
    // First set a valid level
    await server.inject({
      method: 'POST',
      url: '/v1/runtime/pi/preferences',
      payload: { thinkingLevel: 'medium' },
    });

    // Then send an invalid level — should not change the preference
    const response = await server.inject({
      method: 'POST',
      url: '/v1/runtime/pi/preferences',
      payload: { thinkingLevel: 'ultra' },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    // 'ultra' is not a valid pi thinking level, so it should remain 'medium'
    assert.equal(
      body.currentThinkingLevel,
      'medium',
      'invalid thinking level "ultra" should be ignored'
    );
  } finally {
    await server.close();
  }
});

test('AGEAF_PI_MOCK=true makes pi report as configured with mock provider', async () => {
  process.env.AGEAF_PI_MOCK = 'true';
  const server = buildServer();

  try {
    // Health check should report pi as configured
    const healthRes = await server.inject({
      method: 'GET',
      url: '/v1/health',
    });

    assert.equal(healthRes.statusCode, 200);
    const health = JSON.parse(healthRes.body);
    assert.ok(health.pi, 'health response should include pi section');
    assert.equal(health.pi.configured, true, 'pi should be configured in mock mode');
    assert.equal(health.pi.mock, true, 'pi should report mock=true');

    // Metadata should still return valid structure
    const metaRes = await server.inject({
      method: 'GET',
      url: '/v1/runtime/pi/metadata',
    });

    assert.equal(metaRes.statusCode, 200);
    const meta = JSON.parse(metaRes.body);
    assert.ok(Array.isArray(meta.thinkingLevels), 'mock mode should still have thinkingLevels');
  } finally {
    delete process.env.AGEAF_PI_MOCK;
    await server.close();
  }
});

test('POST /v1/runtime/pi/preferences returns thinkingLevels and auto-downgrades', async () => {
  const server = buildServer();

  try {
    // Set thinking level to xhigh
    const setRes = await server.inject({
      method: 'POST',
      url: '/v1/runtime/pi/preferences',
      payload: { thinkingLevel: 'xhigh' },
    });
    assert.equal(setRes.statusCode, 200);
    const setBody = JSON.parse(setRes.body);

    // Response should include thinkingLevels array
    assert.ok(
      Array.isArray(setBody.thinkingLevels),
      'preferences response should include thinkingLevels'
    );
    assert.ok(
      setBody.thinkingLevels.length > 0,
      'thinkingLevels should not be empty'
    );

    // Each level should have id and label
    for (const level of setBody.thinkingLevels) {
      assert.ok(typeof level.id === 'string', 'thinking level should have id');
      assert.ok(typeof level.label === 'string', 'thinking level should have label');
    }

    // If xhigh is not in the supported levels (no model set that supports it),
    // the auto-downgrade should have kicked in
    const supportedIds = setBody.thinkingLevels.map((l: { id: string }) => l.id);
    if (!supportedIds.includes('xhigh')) {
      assert.notEqual(
        setBody.currentThinkingLevel,
        'xhigh',
        'xhigh should be auto-downgraded when not supported'
      );
      assert.ok(
        supportedIds.includes(setBody.currentThinkingLevel),
        'downgraded level should be in supported list'
      );
    }
  } finally {
    await server.close();
  }
});

test('AGEAF_PI_PROVIDER env override appears in metadata', async () => {
  process.env.AGEAF_PI_PROVIDER = 'test-provider-override';
  const server = buildServer();

  try {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/runtime/pi/metadata',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    // The env override should be reflected in currentProvider
    assert.equal(
      body.currentProvider,
      'test-provider-override',
      'AGEAF_PI_PROVIDER should override provider detection'
    );
  } finally {
    delete process.env.AGEAF_PI_PROVIDER;
    await server.close();
  }
});
