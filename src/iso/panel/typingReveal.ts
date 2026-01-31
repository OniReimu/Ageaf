export type TypingRevealOptions = {
  /** Interval between "pops" (matches main assistant streaming cadence). Default 30ms. */
  intervalMs?: number;
  /**
   * Cap total animation duration by increasing tokens-per-tick for very large DOMs.
   * Default 9000ms.
   */
  maxDurationMs?: number;
};

export type TypingRevealController = {
  cancel: () => void;
};

type TextNodeEntry = {
  node: Text;
  original: string;
  tokens: string[];
};

const TOKEN_REGEX = /\s+|[^\s]+/g;

export function startTypingReveal(root: ParentNode, options: TypingRevealOptions = {}): TypingRevealController {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { cancel: () => {} };
  }

  const intervalMs = options.intervalMs ?? 30;
  const maxDurationMs = options.maxDurationMs ?? 9000;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT;
        const text = node.nodeValue ?? '';
        if (!text) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'NOSCRIPT') {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest('[data-ageaf-no-typing]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    } as unknown as NodeFilter
  );

  const entries: TextNodeEntry[] = [];
  let totalTokens = 0;
  let current: Node | null = walker.nextNode();
  while (current) {
    const node = current as Text;
    const original = node.nodeValue ?? '';
    const tokens = original.match(TOKEN_REGEX) ?? [original];
    entries.push({ node, original, tokens });
    totalTokens += tokens.length;
    current = walker.nextNode();
  }

  if (entries.length === 0 || totalTokens === 0) {
    return { cancel: () => {} };
  }

  // Clear text immediately, then reveal progressively.
  for (const entry of entries) {
    entry.node.nodeValue = '';
  }

  const maxTicks = Math.max(1, Math.floor(maxDurationMs / intervalMs));
  const tokensPerTick = Math.max(1, Math.ceil(totalTokens / maxTicks));

  let nodeIdx = 0;
  let tokenIdx = 0;
  let cancelled = false;

  const finish = () => {
    for (const entry of entries) {
      entry.node.nodeValue = entry.original;
    }
  };

  const timerId = window.setInterval(() => {
    if (cancelled) return;

    for (let i = 0; i < tokensPerTick; i += 1) {
      const entry = entries[nodeIdx];
      if (!entry) {
        window.clearInterval(timerId);
        return;
      }
      const nextToken = entry.tokens[tokenIdx];
      if (nextToken === undefined) {
        nodeIdx += 1;
        tokenIdx = 0;
        i -= 1; // retry on next node without consuming a tick slot
        continue;
      }
      entry.node.nodeValue = (entry.node.nodeValue ?? '') + nextToken;
      tokenIdx += 1;
    }

    if (nodeIdx >= entries.length) {
      window.clearInterval(timerId);
    }
  }, intervalMs);

  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      window.clearInterval(timerId);
      finish();
    },
  };
}


