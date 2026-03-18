import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';
import { resetCodexAppServerForTests } from '../src/runtimes/codex/appServer.js';
import { runCodexJob } from '../src/runtimes/codex/run.js';

function planEvents(events: JobEvent[]) {
  return events
    .filter((e) => e.event === 'plan')
    .map((e) => e.data as Record<string, unknown>);
}

test('Codex runtime emits tool_complete on item/completed', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-tool-lifecycle');
  const events: JobEvent[] = [];

  try {
    await runCodexJob(
      {
        action: 'chat',
        context: { message: 'Hello' },
        runtime: {
          codex: {
            cliPath,
            envVars: '',
            approvalPolicy: 'on-request',
          },
        },
      },
      (event) => events.push(event),
    );

    const plans = planEvents(events);

    // Read tool: tool_start then tool_complete via item/completed
    const readStart = plans.find(
      (p) => p.phase === 'tool_start' && p.toolId === 'tool-read-1',
    );
    assert.ok(readStart, 'expected tool_start for Read');
    assert.equal(readStart.toolName, 'Read');
    assert.equal(readStart.input, '/src/main.ts');

    const readComplete = plans.find(
      (p) => p.phase === 'tool_complete' && p.toolId === 'tool-read-1',
    );
    assert.ok(readComplete, 'expected tool_complete for Read from item/completed');
    assert.equal(readComplete.toolName, 'Read');
  } finally {
    await resetCodexAppServerForTests();
  }
});

test('Codex runtime emits tool_complete on item/toolCall/completed', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-tool-lifecycle');
  const events: JobEvent[] = [];

  try {
    await runCodexJob(
      {
        action: 'chat',
        context: { message: 'Hello' },
        runtime: {
          codex: {
            cliPath,
            envVars: '',
            approvalPolicy: 'on-request',
          },
        },
      },
      (event) => events.push(event),
    );

    const plans = planEvents(events);

    // Bash tool: tool_start then tool_complete via item/toolCall/completed
    const bashStart = plans.find(
      (p) => p.phase === 'tool_start' && p.toolId === 'tool-bash-1',
    );
    assert.ok(bashStart, 'expected tool_start for Bash');
    assert.equal(bashStart.toolName, 'Bash');

    const bashComplete = plans.find(
      (p) => p.phase === 'tool_complete' && p.toolId === 'tool-bash-1',
    );
    assert.ok(bashComplete, 'expected tool_complete for Bash from item/toolCall/completed');
    assert.equal(bashComplete.toolName, 'Bash');
  } finally {
    await resetCodexAppServerForTests();
  }
});

test('Codex runtime completes remaining pending tools on turn/completed', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-tool-lifecycle');
  const events: JobEvent[] = [];

  try {
    await runCodexJob(
      {
        action: 'chat',
        context: { message: 'Hello' },
        runtime: {
          codex: {
            cliPath,
            envVars: '',
            approvalPolicy: 'on-request',
          },
        },
      },
      (event) => events.push(event),
    );

    const plans = planEvents(events);

    // Grep tool: started but no explicit completion -> completed by turn/completed
    const grepStart = plans.find(
      (p) => p.phase === 'tool_start' && p.toolId === 'tool-grep-1',
    );
    assert.ok(grepStart, 'expected tool_start for Grep');
    assert.equal(grepStart.toolName, 'Grep');

    const grepComplete = plans.find(
      (p) => p.phase === 'tool_complete' && p.toolId === 'tool-grep-1',
    );
    assert.ok(grepComplete, 'expected tool_complete for Grep from turn/completed cleanup');
    assert.equal(grepComplete.toolName, 'Grep');
  } finally {
    await resetCodexAppServerForTests();
  }
});

test('Codex runtime tool lifecycle ordering is correct', async () => {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-tool-lifecycle');
  const events: JobEvent[] = [];

  try {
    await runCodexJob(
      {
        action: 'chat',
        context: { message: 'Hello' },
        runtime: {
          codex: {
            cliPath,
            envVars: '',
            approvalPolicy: 'on-request',
          },
        },
      },
      (event) => events.push(event),
    );

    const plans = planEvents(events);
    const phases = plans.map((p) => `${p.toolId}:${p.phase}`);

    // Read start must come before Read complete
    const readStartIdx = phases.indexOf('tool-read-1:tool_start');
    const readCompleteIdx = phases.indexOf('tool-read-1:tool_complete');
    assert.ok(readStartIdx >= 0, 'read start found');
    assert.ok(readCompleteIdx >= 0, 'read complete found');
    assert.ok(readStartIdx < readCompleteIdx, 'read start before complete');

    // Bash start must come before Bash complete
    const bashStartIdx = phases.indexOf('tool-bash-1:tool_start');
    const bashCompleteIdx = phases.indexOf('tool-bash-1:tool_complete');
    assert.ok(bashStartIdx >= 0, 'bash start found');
    assert.ok(bashCompleteIdx >= 0, 'bash complete found');
    assert.ok(bashStartIdx < bashCompleteIdx, 'bash start before complete');

    // No duplicate tool_complete events
    const readCompletes = plans.filter(
      (p) => p.phase === 'tool_complete' && p.toolId === 'tool-read-1',
    );
    assert.equal(readCompletes.length, 1, 'exactly one tool_complete for Read');

    const bashCompletes = plans.filter(
      (p) => p.phase === 'tool_complete' && p.toolId === 'tool-bash-1',
    );
    assert.equal(bashCompletes.length, 1, 'exactly one tool_complete for Bash');
  } finally {
    await resetCodexAppServerForTests();
  }
});
