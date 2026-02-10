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

  if (patch.kind === 'replaceRangeInFile') {
    if (
      typeof (patch as any).filePath !== 'string' ||
      typeof (patch as any).expectedOldText !== 'string' ||
      typeof patch.text !== 'string'
    ) {
      throw new Error('Invalid patch');
    }

    const from = (patch as any).from;
    const to = (patch as any).to;
    const lineFrom = (patch as any).lineFrom;
    const hasFrom = typeof from === 'number' && Number.isFinite(from);
    const hasTo = typeof to === 'number' && Number.isFinite(to);
    const hasLineFrom =
      typeof lineFrom === 'number' &&
      Number.isFinite(lineFrom) &&
      lineFrom > 0;
    if ((hasFrom || hasTo) && !(hasFrom && hasTo && to >= from)) {
      throw new Error('Invalid patch');
    }

    return {
      kind: 'replaceRangeInFile',
      filePath: (patch as any).filePath,
      expectedOldText: (patch as any).expectedOldText,
      text: patch.text,
      ...(hasFrom && hasTo ? { from, to } : {}),
      ...(hasLineFrom ? { lineFrom } : {}),
    };
  }

  throw new Error('Invalid patch');
}
