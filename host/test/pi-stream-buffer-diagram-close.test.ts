import assert from 'node:assert/strict';
import test from 'node:test';

import { PiStreamBuffer } from '../src/runtimes/pi/streamBuffer.js';

test('PiStreamBuffer closes ageaf-diagram fence when closing ticks are inline', () => {
  const events: Array<{ event: string; data?: unknown }> = [];
  const emitEvent = (event: { event: string; data?: unknown }) => {
    events.push(event);
  };

  const buffer = new PiStreamBuffer(emitEvent as any, []);
  buffer.pushDelta(
    'Intro\n```ageaf-diagram\n<svg viewBox="0 0 1 1"></svg>```\nTail'
  );
  buffer.flush();

  const emitted = events
    .filter((entry) => entry.event === 'delta')
    .map((entry) => String((entry.data as { text?: unknown })?.text ?? ''))
    .join('');

  assert.match(emitted, /\*Rendering diagram…\*/);
  assert.match(
    emitted,
    /```ageaf-diagram\n<svg viewBox="0 0 1 1"><\/svg>\n```/
  );
  assert.match(emitted, /\nTail/);
  assert.doesNotMatch(emitted, /<\/svg>```/);
});

test('PiStreamBuffer drops oversized diagrams instead of emitting ageaf-diagram fence', () => {
  const events: Array<{ event: string; data?: unknown }> = [];
  const emitEvent = (event: { event: string; data?: unknown }) => {
    events.push(event);
  };

  const buffer = new PiStreamBuffer(emitEvent as any, []);
  const giantSvg = '<svg>' + 'x'.repeat(450_000) + '</svg>';
  buffer.pushDelta('```ageaf-diagram\n' + giantSvg + '\n```\nAfter');
  buffer.flush();

  const emitted = events
    .filter((entry) => entry.event === 'delta')
    .map((entry) => String((entry.data as { text?: unknown })?.text ?? ''))
    .join('');

  assert.match(emitted, /\*Rendering diagram…\*/);
  assert.match(emitted, /Diagram output too large to render safely/);
  assert.doesNotMatch(emitted, /```ageaf-diagram/);
  assert.match(emitted, /\nAfter/);
});
