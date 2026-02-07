export type Patch =
  | {
    kind: 'replaceRangeInFile';
    filePath: string;
    expectedOldText: string;
    text: string;
    from?: number;
    to?: number;
    lineFrom?: number;
  }
  | { kind: 'replaceSelection'; text: string }
  | { kind: 'insertAtCursor'; text: string };

export type JobEvent = {
  event: 'plan' | 'delta' | 'tool_call' | 'tool_result' | 'trace' | 'patch' | 'usage' | 'done';
  data: unknown;
};

export type Job = {
  id: string;
  events: JobEvent[];
};
