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

test('Codex runtime recognizes web_search_call type and extracts query from action', async () => {
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

    // web_search_call with query in action field
    const wsStart = plans.find(
      (p) => p.phase === 'tool_start' && p.toolId === 'tool-ws-1',
    );
    assert.ok(wsStart, 'expected tool_start for web_search_call');
    assert.equal(wsStart.toolName, 'WebSearch');
    assert.equal(wsStart.input, 'OpenAI Codex CLI documentation');

    const wsComplete = plans.find(
      (p) => p.phase === 'tool_complete' && p.toolId === 'tool-ws-1',
    );
    assert.ok(wsComplete, 'expected tool_complete for web search');
  } finally {
    await resetCodexAppServerForTests();
  }
});

test('Codex runtime emits tool_update with late-arriving web search query', async () => {
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

    // web_search_call without query at start
    const wsStart = plans.find(
      (p) => p.phase === 'tool_start' && p.toolId === 'tool-ws-2',
    );
    assert.ok(wsStart, 'expected tool_start for web search without query');
    assert.equal(wsStart.toolName, 'WebSearch');
    assert.equal(wsStart.input, undefined, 'no query at start time');

    // tool_update should arrive with the late query from item/completed
    const wsUpdate = plans.find(
      (p) => p.phase === 'tool_update' && p.toolId === 'tool-ws-2',
    );
    assert.ok(wsUpdate, 'expected tool_update with late query');
    assert.equal(wsUpdate.input, 'late arriving query');

    const wsComplete = plans.find(
      (p) => p.phase === 'tool_complete' && p.toolId === 'tool-ws-2',
    );
    assert.ok(wsComplete, 'expected tool_complete');
  } finally {
    await resetCodexAppServerForTests();
  }
});

// Helper to run fixture and collect plan events
async function runFixtureAndGetPlans(): Promise<Record<string, unknown>[]> {
  const cliPath = path.join(process.cwd(), 'test', 'fixtures', 'codex-tool-lifecycle');
  const events: JobEvent[] = [];
  await runCodexJob(
    {
      action: 'chat',
      context: { message: 'Hello' },
      runtime: { codex: { cliPath, envVars: '', approvalPolicy: 'on-request' } },
    },
    (event) => events.push(event),
  );
  return planEvents(events);
}

test('Codex runtime recognizes file_search_call type', async () => {
  try {
    const plans = await runFixtureAndGetPlans();
    const start = plans.find((p) => p.phase === 'tool_start' && p.toolId === 'tool-fs-1');
    assert.ok(start, 'expected tool_start for file_search_call');
    assert.equal(start.toolName, 'FileSearch');
    assert.equal(start.input, 'deployment config');

    const complete = plans.find((p) => p.phase === 'tool_complete' && p.toolId === 'tool-fs-1');
    assert.ok(complete, 'expected tool_complete for file_search_call');
  } finally {
    await resetCodexAppServerForTests();
  }
});

test('Codex runtime recognizes code_interpreter_call type', async () => {
  try {
    const plans = await runFixtureAndGetPlans();
    const start = plans.find((p) => p.phase === 'tool_start' && p.toolId === 'tool-ci-1');
    assert.ok(start, 'expected tool_start for code_interpreter_call');
    assert.equal(start.toolName, 'CodeInterpreter');
    assert.ok(String(start.input).includes("print('hello')"), 'code input extracted');
  } finally {
    await resetCodexAppServerForTests();
  }
});

test('Codex runtime recognizes shell_call type as Bash', async () => {
  try {
    const plans = await runFixtureAndGetPlans();
    const start = plans.find((p) => p.phase === 'tool_start' && p.toolId === 'tool-sh-1');
    assert.ok(start, 'expected tool_start for shell_call');
    assert.equal(start.toolName, 'Bash');
    assert.equal(start.input, 'ls -la');
  } finally {
    await resetCodexAppServerForTests();
  }
});

test('Codex runtime recognizes apply_patch_call type as Edit', async () => {
  try {
    const plans = await runFixtureAndGetPlans();
    const start = plans.find((p) => p.phase === 'tool_start' && p.toolId === 'tool-ap-1');
    assert.ok(start, 'expected tool_start for apply_patch_call');
    assert.equal(start.toolName, 'Edit');
    assert.equal(start.input, '/src/index.ts');
  } finally {
    await resetCodexAppServerForTests();
  }
});

test('Codex runtime recognizes image_generation_call type', async () => {
  try {
    const plans = await runFixtureAndGetPlans();
    const start = plans.find((p) => p.phase === 'tool_start' && p.toolId === 'tool-ig-1');
    assert.ok(start, 'expected tool_start for image_generation_call');
    assert.equal(start.toolName, 'ImageGeneration');
    assert.equal(start.input, 'a cat on a rocket');
  } finally {
    await resetCodexAppServerForTests();
  }
});

test('Codex runtime recognizes computer_call type', async () => {
  try {
    const plans = await runFixtureAndGetPlans();
    const start = plans.find((p) => p.phase === 'tool_start' && p.toolId === 'tool-cc-1');
    assert.ok(start, 'expected tool_start for computer_call');
    assert.equal(start.toolName, 'Computer');
    assert.equal(start.input, 'screenshot');
  } finally {
    await resetCodexAppServerForTests();
  }
});
