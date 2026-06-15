const assert = require('node:assert/strict');
const test = require('node:test');

const {
  detectContextIntent,
  computeContextPolicy,
  buildContextPayload,
} = require('../src/iso/panel/contextPolicy.test-exports.cjs');

test('detectContextIntent classifies rewrite action as edit_local', () => {
  const intent = detectContextIntent({
    action: 'rewrite',
    message: 'Rewrite selection',
    hasSelection: true,
  });

  assert.equal(intent, 'edit_local');
});

test('detectContextIntent treats short prior-turn follow-up as meta_followup', () => {
  const intent = detectContextIntent({
    action: 'chat',
    message: '你评价下刚才那段写的咋样',
    hasSelection: true,
  });

  assert.equal(intent, 'meta_followup');
});

test('computeContextPolicy keeps rewrite requests on selection with narrow surrounding', () => {
  const policy = computeContextPolicy({
    intent: 'edit_local',
    hasSelection: true,
    surroundingContextLimit: 5000,
    sessionUsageRatio: 0.15,
  });

  assert.equal(policy.attachSelection, true);
  assert.equal(policy.surroundingMode, 'narrow');
  assert.equal(policy.preferRetrieval, false);
  assert.ok(policy.surroundingBudgetChars > 0);
  assert.ok(
    policy.surroundingBudgetChars <= 800,
    'narrow surrounding budget should be capped well below the old 5000-char default'
  );
});

test('computeContextPolicy routes codebase queries to retrieval instead of local context', () => {
  const policy = computeContextPolicy({
    intent: 'codebase_query',
    hasSelection: true,
    surroundingContextLimit: 5000,
    sessionUsageRatio: 0.2,
  });

  assert.equal(policy.attachSelection, false);
  assert.equal(policy.surroundingMode, 'none');
  assert.equal(policy.surroundingBudgetChars, 0);
  assert.equal(policy.preferRetrieval, true);
});

test('computeContextPolicy shrinks surrounding budget as session usage grows', () => {
  const lowUsage = computeContextPolicy({
    intent: 'edit_local',
    hasSelection: true,
    surroundingContextLimit: 5000,
    sessionUsageRatio: 0.2,
  });
  const highUsage = computeContextPolicy({
    intent: 'edit_local',
    hasSelection: true,
    surroundingContextLimit: 5000,
    sessionUsageRatio: 0.7,
  });

  assert.ok(highUsage.surroundingBudgetChars < lowUsage.surroundingBudgetChars);
});

test('buildContextPayload strips selection and surrounding context for meta follow-up turns', () => {
  const payload = buildContextPayload({
    message: '你评价下刚才那段写的咋样',
    selection: {
      selection: 'Selected text',
      before: 'Context before',
      after: 'Context after',
    },
    policy: computeContextPolicy({
      intent: 'meta_followup',
      hasSelection: true,
      surroundingContextLimit: 5000,
      sessionUsageRatio: 0.1,
    }),
  });

  assert.equal(payload.selection, '');
  assert.equal(payload.surroundingBefore, '');
  assert.equal(payload.surroundingAfter, '');
});
