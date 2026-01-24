export type Patch =
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
