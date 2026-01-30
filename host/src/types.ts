export type Patch =
  | {
      kind: 'replaceRangeInFile';
      filePath: string;
      expectedOldText: string;
      text: string;
      from?: number;
      to?: number;
    }
  | { kind: 'replaceSelection'; text: string }
  | { kind: 'insertAtCursor'; text: string };

export type JobEvent = {
  event: 'plan' | 'delta' | 'tool_call' | 'patch' | 'usage' | 'done';
  data: unknown;
};

export type Job = {
  id: string;
  events: JobEvent[];
};
