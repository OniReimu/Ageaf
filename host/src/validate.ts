import type { Patch } from './types.js';

export function validatePatch(value: unknown): Patch {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid patch');
  }

  const patch = value as Partial<Patch> & { kind?: string };
  if (patch.kind === 'replaceSelection' || patch.kind === 'insertAtCursor') {
    if (typeof patch.text !== 'string') {
      throw new Error('Invalid patch');
    }

    return { kind: patch.kind, text: patch.text } as Patch;
  }

  throw new Error('Invalid patch');
}
