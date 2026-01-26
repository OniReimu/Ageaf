import { strict as assert } from 'node:assert';
import test from 'node:test';

import { sendCompactCommand } from '../src/compaction/sendCompact.js';

test('Codex compact rejects if no threadId provided', async () => {
  const mockEvents: any[] = [];
  const emitEvent = (event: any) => mockEvents.push(event);

  const payload = {
    runtime: {
      codex: {
        threadId: '',
      },
    },
  };

  try {
    await sendCompactCommand('codex', payload, emitEvent);
    assert.fail('Should have thrown missing threadId error');
  } catch (error: any) {
    assert.match(error.message, /No Codex thread/i);
  }
});

test('Codex compact rejects if threadId is whitespace only', async () => {
  const mockEvents: any[] = [];
  const emitEvent = (event: any) => mockEvents.push(event);

  const payload = {
    runtime: {
      codex: {
        threadId: '   ',
      },
    },
  };

  try {
    await sendCompactCommand('codex', payload, emitEvent);
    assert.fail('Should have thrown missing threadId error');
  } catch (error: any) {
    assert.match(error.message, /No Codex thread/i);
  }
});

test('Claude compact rejects concurrent compaction', async () => {
  const conversationId = 'test-conversation';
  const mockEvents: any[] = [];
  const emitEvent = (event: any) => mockEvents.push(event);

  const payload = {
    runtime: {
      claude: {
        conversationId,
        cliPath: process.env.CLAUDE_CLI_PATH || 'claude',
      },
    },
  };

  // First compact will timeout/fail but will lock
  const firstCompact = sendCompactCommand('claude', payload, emitEvent).catch(() => {
    // Expected to fail/timeout
  });

  // Give first compact time to acquire lock
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Second concurrent compact should fail immediately
  try {
    await sendCompactCommand('claude', payload, emitEvent);
    assert.fail('Should have thrown concurrent compaction error');
  } catch (error: any) {
    assert.match(error.message, /already in progress/i);
  }

  // Wait for first to complete/timeout
  await firstCompact;
});
