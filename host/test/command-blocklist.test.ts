import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileBlockedCommandPatterns,
  matchBlockedCommand,
  parseBlockedCommandPatterns,
} from '../src/runtimes/claude/safety.js';

test('command blocklist parses patterns and matches via regex or substring fallback', () => {
  const patterns = parseBlockedCommandPatterns(`
# comment
^sudo\\s+rm\\b
rm -rf
chmod 777
chmod -R 777
(
`);

  // includes invalid regex "(" which should fall back to substring match
  const compiled = compileBlockedCommandPatterns(patterns);

  assert.equal(matchBlockedCommand('rm -rf /', compiled), 'rm -rf');
  assert.equal(matchBlockedCommand('chmod 777 foo', compiled), 'chmod 777');
  assert.equal(matchBlockedCommand('sudo rm -rf /', compiled), '^sudo\\s+rm\\b');

  // substring fallback for invalid regex "("
  assert.equal(matchBlockedCommand('echo (', compiled), '(');

  assert.equal(matchBlockedCommand('echo safe', compiled), null);
});


